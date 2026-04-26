import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encode as base32Encode, decode as base32Decode } from "https://deno.land/std@0.177.0/encoding/base32.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalizeBase32ForDecode(input: string) {
  const cleaned = String(input)
    .trim()
    .replace(/\s+/g, "")
    .replace(/=+$/g, "")
    .toUpperCase();

  // base32 strings are typically padded to a multiple of 8
  const padLen = (8 - (cleaned.length % 8)) % 8;
  return cleaned + "=".repeat(padLen);
}
// TOTP Implementation using HMAC-SHA1
async function generateHOTP(secret: Uint8Array, counter: number): Promise<string> {
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setBigUint64(0, BigInt(counter), false);

  // Create a new ArrayBuffer to ensure compatibility
  const secretBuffer = new ArrayBuffer(secret.length);
  const secretView = new Uint8Array(secretBuffer);
  secretView.set(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, counterBytes.buffer);
  const hash = new Uint8Array(signature);

  const offset = hash[hash.length - 1] & 0xf;
  const code = (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  ) % 1000000;

  return code.toString().padStart(6, '0');
}

async function generateTOTP(secret: Uint8Array, timeStep = 30): Promise<string> {
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  return generateHOTP(secret, counter);
}

async function verifyTOTP(secret: Uint8Array, token: string, window = 2): Promise<boolean> {
  const counter = Math.floor(Date.now() / 1000 / 30);
  
  // Widen search window to ±60 seconds to accommodate clock drift
  for (let i = -window; i <= window; i++) {
    const expectedToken = await generateHOTP(secret, counter + i);
    if (expectedToken === token) {
      return true;
    }
  }
  return false;
}

function generateSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(20));
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    codes.push(code.toUpperCase());
  }
  return codes;
}

// AES-256-GCM encryption using Web Crypto API
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('ENCRYPTION_KEY');
  if (!keyHex) {
    throw new Error('Encryption key not configured');
  }
  
  // Validate key length: AES-256 requires 32 bytes = 64 hex characters
  const cleanHex = keyHex.replace(/[^0-9a-fA-F]/g, ''); // Strip non-hex (whitespace, dashes, quotes)
  console.info(`ENCRYPTION_KEY: len=${keyHex.length}, cleanLen=${cleanHex.length}, first10=${cleanHex.slice(0,10)}`);
  if (cleanHex.length !== 64) {
    console.error(`ENCRYPTION_KEY invalid: cleanLen=${cleanHex.length} (need 64 for AES-256)`);
    throw new Error('Encryption key length invalid');
  }
  
  const keyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Hash backup code for storage
async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    let user = null;
    
    // Some actions (like check_login_allowed) don't require auth
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      
      // Try getUser with token first
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && authUser) {
        user = authUser;
      } else {
        // Fallback: decode JWT and use admin API
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.sub) {
            const { data: { user: adminUser } } = await supabase.auth.admin.getUserById(payload.sub);
            if (adminUser) user = adminUser;
          }
        } catch (_e) {
          // Token invalid
        }
      }
    }

    const body = await req.json();
    const { action, ...params } = body;
    console.log(`Security action: ${action}`);

    let result;

    switch (action) {
      // ==================== 2FA / TOTP ====================
      case 'setup_2fa': {
        if (!user) throw new Error('Authentication required');
        
        // Generate new TOTP secret
        const secretBytes = generateSecret();

        // Base32 secrets for authenticator apps should be uppercase and typically without padding.
        // We'll store without padding, and add padding back only when decoding.
        const secretBase32 = base32Encode(secretBytes).replace(/=+$/g, "").toUpperCase();

        // Generate backup codes
        const backupCodes = generateBackupCodes();
        const hashedCodes = await Promise.all(backupCodes.map(hashCode));

        // Encrypt secret and backup codes
        const encryptedSecret = await encrypt(secretBase32);
        const encryptedBackupCodes = await encrypt(JSON.stringify(hashedCodes));

        // Upsert TOTP record (not enabled yet - requires verification)
        await supabase
          .from('user_totp_secrets')
          .upsert({
            user_id: user.id,
            secret_encrypted: encryptedSecret,
            backup_codes_encrypted: encryptedBackupCodes,
            is_enabled: false,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        // Generate QR code URL (otpauth URI)
        const issuer = 'ThriftPal';
        const accountName = encodeURIComponent(user.email || user.id);
        const otpauthUrl = `otpauth://totp/${issuer}:${accountName}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

        result = {
          success: true,
          secret: secretBase32, // User needs this to add to authenticator app
          otpauth_url: otpauthUrl,
          backup_codes: backupCodes, // Show once, user must save these
          message: 'Scan the QR code with your authenticator app, then verify with a code',
        };
        break;
      }

      case 'verify_2fa_setup': {
        if (!user) throw new Error('Authentication required');
        
        const { token } = params;
        if (!token || token.length !== 6) {
          throw new Error('Invalid verification code');
        }
        
        // Get the pending TOTP secret
        const { data: totpRecord, error: fetchError } = await supabase
          .from('user_totp_secrets')
          .select('secret_encrypted, is_enabled')
          .eq('user_id', user.id)
          .single();
        
        if (fetchError || !totpRecord) {
          throw new Error('No pending 2FA setup found. Please start setup again.');
        }
        
        if (totpRecord.is_enabled) {
          throw new Error('2FA is already enabled');
        }
        
        // Decrypt and verify
        const secretBase32 = await decrypt(totpRecord.secret_encrypted);
        const secretBytes = base32Decode(normalizeBase32ForDecode(secretBase32));

        const isValid = await verifyTOTP(secretBytes, String(token).trim());
        
        if (!isValid) {
          throw new Error('Invalid verification code. Please try again.');
        }
        
        // Enable 2FA
        await supabase
          .from('user_totp_secrets')
          .update({
            is_enabled: true,
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
        
        // Log the action
        await supabase.rpc('log_audit_event', {
          _user_id: user.id,
          _action: '2fa_enabled',
          _resource_type: 'security',
          _details: { method: 'totp' },
        });
        
        result = {
          success: true,
          message: '2FA has been enabled successfully',
        };
        break;
      }

      case 'verify_2fa': {
        if (!user) throw new Error('Authentication required');
        
        const { token, purpose } = params;
        if (!token) {
          throw new Error('Verification code is required');
        }
        
        // Get TOTP secret
        const { data: totpRecord, error: fetchError } = await supabase
          .from('user_totp_secrets')
          .select('secret_encrypted, backup_codes_encrypted, is_enabled')
          .eq('user_id', user.id)
          .single();
        
        if (fetchError || !totpRecord || !totpRecord.is_enabled) {
          // 2FA not enabled, allow action
          result = { success: true, verified: true, reason: '2fa_not_enabled' };
          break;
        }
        
        // Try TOTP first
        const secretBase32 = await decrypt(totpRecord.secret_encrypted);
        const secretBytes = base32Decode(normalizeBase32ForDecode(secretBase32));

        const normalizedToken = String(token).trim().replace(/\s+/g, "");
        let isValid = await verifyTOTP(secretBytes, normalizedToken);
        
        // If TOTP fails, try backup codes
        if (!isValid && token.length === 8) {
          const hashedCodes: string[] = JSON.parse(await decrypt(totpRecord.backup_codes_encrypted));
          const hashedInput = await hashCode(token.toUpperCase());
          
          const codeIndex = hashedCodes.indexOf(hashedInput);
          if (codeIndex !== -1) {
            // Remove used backup code
            hashedCodes.splice(codeIndex, 1);
            const encryptedBackupCodes = await encrypt(JSON.stringify(hashedCodes));
            await supabase
              .from('user_totp_secrets')
              .update({ backup_codes_encrypted: encryptedBackupCodes })
              .eq('user_id', user.id);
            
            isValid = true;
          }
        }
        
        if (!isValid) {
          throw new Error('Invalid verification code');
        }
        
        // Log verification
        await supabase.rpc('log_audit_event', {
          _user_id: user.id,
          _action: '2fa_verified',
          _resource_type: 'security',
          _details: { purpose: purpose || 'general' },
        });
        
        result = { success: true, verified: true };
        break;
      }

      case 'disable_2fa': {
        if (!user) throw new Error('Authentication required');
        
        const { token } = params;
        if (!token) {
          throw new Error('Verification code is required to disable 2FA');
        }
        
        // Verify current 2FA
        const { data: totpRecord } = await supabase
          .from('user_totp_secrets')
          .select('secret_encrypted, is_enabled')
          .eq('user_id', user.id)
          .single();
        
        if (!totpRecord?.is_enabled) {
          throw new Error('2FA is not enabled');
        }
        
        const secretBase32 = await decrypt(totpRecord.secret_encrypted);
        const secretBytes = base32Decode(normalizeBase32ForDecode(secretBase32));
        const isValid = await verifyTOTP(secretBytes, String(token).trim().replace(/\s+/g, ""));

        if (!isValid) {
          throw new Error('Invalid verification code');
        }
        
        // Delete TOTP record
        await supabase
          .from('user_totp_secrets')
          .delete()
          .eq('user_id', user.id);
        
        await supabase.rpc('log_audit_event', {
          _user_id: user.id,
          _action: '2fa_disabled',
          _resource_type: 'security',
        });
        
        result = { success: true, message: '2FA has been disabled' };
        break;
      }

      case 'get_2fa_status': {
        if (!user) throw new Error('Authentication required');
        
        const { data: totpRecord } = await supabase
          .from('user_totp_secrets')
          .select('is_enabled, verified_at')
          .eq('user_id', user.id)
          .single();
        
        result = {
          success: true,
          is_enabled: totpRecord?.is_enabled || false,
          verified_at: totpRecord?.verified_at || null,
        };
        break;
      }

      // ==================== Device Management ====================
      case 'register_device': {
        if (!user) throw new Error('Authentication required');
        
        const { fingerprint, device_name, browser, os, ip_address } = params;
        if (!fingerprint) {
          throw new Error('Device fingerprint is required');
        }
        
        // Check if device exists
        const { data: existingDevice } = await supabase
          .from('user_devices')
          .select('*')
          .eq('user_id', user.id)
          .eq('device_fingerprint', fingerprint)
          .single();
        
        if (existingDevice) {
          // Update last used
          await supabase
            .from('user_devices')
            .update({ 
              last_used_at: new Date().toISOString(),
              is_current: true,
            })
            .eq('id', existingDevice.id);
          
          // Set other devices as not current
          await supabase
            .from('user_devices')
            .update({ is_current: false })
            .eq('user_id', user.id)
            .neq('id', existingDevice.id);
          
          result = { 
            success: true, 
            is_new_device: false,
            is_trusted: existingDevice.is_trusted,
          };
        } else {
          // New device - check velocity
          const { data: velocityResult } = await supabase.rpc('check_velocity', {
            _user_id: user.id,
            _event_type: 'device_login',
          });
          
          // Auto-trust the device if it's during registration/login
          // This ensures the current device is always trusted
          const shouldAutoTrust = true;
          
          // Register new device as trusted by default
          await supabase
            .from('user_devices')
            .insert({
              user_id: user.id,
              device_fingerprint: fingerprint,
              device_name: device_name || 'Unknown Device',
              browser: browser || null,
              os: os || null,
              ip_address: ip_address || null,
              is_trusted: shouldAutoTrust,
              is_current: true,
            });
          
          // Set other devices as not current
          await supabase
            .from('user_devices')
            .update({ is_current: false })
            .eq('user_id', user.id)
            .neq('device_fingerprint', fingerprint);
          
          // Log new device
          await supabase.rpc('log_audit_event', {
            _user_id: user.id,
            _action: 'new_device_login',
            _resource_type: 'device',
            _details: { fingerprint, device_name, browser, os, auto_trusted: shouldAutoTrust },
          });
          
          result = { 
            success: true, 
            is_new_device: true, 
            is_trusted: shouldAutoTrust,
            requires_verification: !shouldAutoTrust,
            velocity_flagged: velocityResult?.flagged || false,
          };
        }
        break;
      }

      case 'trust_device': {
        if (!user) throw new Error('Authentication required');
        
        const { fingerprint, token } = params;
        if (!fingerprint) {
          throw new Error('Device fingerprint is required');
        }
        
        // Verify 2FA if enabled
        const { data: totpRecord } = await supabase
          .from('user_totp_secrets')
          .select('is_enabled')
          .eq('user_id', user.id)
          .single();
        
        if (totpRecord?.is_enabled && token) {
          // Verify token via recursive call
          const verifyResult = await supabase.functions.invoke('security-controls', {
            body: { action: 'verify_2fa', token },
          });
          
          if (!verifyResult.data?.verified) {
            throw new Error('Invalid verification code');
          }
        }
        
        await supabase
          .from('user_devices')
          .update({ is_trusted: true })
          .eq('user_id', user.id)
          .eq('device_fingerprint', fingerprint);
        
        result = { success: true, message: 'Device trusted successfully' };
        break;
      }

      case 'remove_device': {
        if (!user) throw new Error('Authentication required');
        
        const { device_id } = params;
        if (!device_id) {
          throw new Error('Device ID is required');
        }
        
        await supabase
          .from('user_devices')
          .delete()
          .eq('user_id', user.id)
          .eq('id', device_id);
        
        result = { success: true, message: 'Device removed' };
        break;
      }

      case 'get_devices': {
        if (!user) throw new Error('Authentication required');
        
        const { data: devices } = await supabase
          .from('user_devices')
          .select('id, device_fingerprint, device_name, browser, os, is_trusted, is_current, last_used_at, created_at')
          .eq('user_id', user.id)
          .order('last_used_at', { ascending: false });
        
        result = { success: true, devices: devices || [] };
        break;
      }

      // ==================== Login Security ====================
      case 'check_login_allowed': {
        const { email, ip_address } = params;
        if (!email) {
          throw new Error('Email is required');
        }
        
        const { data: checkResult, error } = await supabase.rpc('check_login_allowed', {
          _email: email,
          _ip_address: ip_address || null,
        });
        
        if (error) throw error;
        
        result = checkResult;
        break;
      }

      case 'record_login_attempt': {
        const { email, success, ip_address, fingerprint, failure_reason } = params;
        
        await supabase.rpc('record_login_attempt', {
          _email: email,
          _success: success,
          _ip_address: ip_address || null,
          _device_fingerprint: fingerprint || null,
          _failure_reason: failure_reason || null,
        });
        
        result = { success: true };
        break;
      }

      // ==================== Withdrawal Controls ====================
      case 'check_withdrawal': {
        if (!user) throw new Error('Authentication required');
        
        const { amount } = params;
        if (!amount || amount <= 0) {
          throw new Error('Valid amount is required');
        }
        
        // Check limits
        const { data: limitResult, error: limitError } = await supabase.rpc('check_withdrawal_limits', {
          _user_id: user.id,
          _amount: amount,
        });
        
        if (limitError) throw limitError;
        
        if (!limitResult.allowed) {
          result = limitResult;
          break;
        }
        
        // Check velocity
        const { data: velocityResult } = await supabase.rpc('check_velocity', {
          _user_id: user.id,
          _event_type: 'withdrawal',
          _amount: amount,
        });
        
        if (velocityResult?.flagged) {
          result = {
            allowed: false,
            reason: 'Unusual withdrawal activity detected. Please try again later or contact support.',
            flagged: true,
          };
          break;
        }
        
        // Check 2FA requirement
        const { data: totpRecord } = await supabase
          .from('user_totp_secrets')
          .select('is_enabled')
          .eq('user_id', user.id)
          .single();
        
        result = {
          ...limitResult,
          requires_2fa: totpRecord?.is_enabled || false,
        };
        break;
      }

      case 'record_withdrawal': {
        if (!user) throw new Error('Authentication required');
        
        const { amount } = params;
        
        // Update withdrawal limits
        await supabase
          .from('withdrawal_limits')
          .update({
            daily_used: supabase.rpc('withdrawal_limits.daily_used') + amount,
            monthly_used: supabase.rpc('withdrawal_limits.monthly_used') + amount,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
        
        result = { success: true };
        break;
      }

      case 'set_bank_cooldown': {
        if (!user) throw new Error('Authentication required');
        
        // Set 24-hour cooldown after bank change
        const cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        await supabase
          .from('withdrawal_limits')
          .upsert({
            user_id: user.id,
            cooldown_until: cooldownUntil,
            cooldown_reason: 'Bank details changed',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        
        // Record velocity event
        await supabase.rpc('check_velocity', {
          _user_id: user.id,
          _event_type: 'bank_change',
        });
        
        // Update profile
        await supabase
          .from('profiles')
          .update({ bank_details_changed_at: new Date().toISOString() })
          .eq('id', user.id);
        
        await supabase.rpc('log_audit_event', {
          _user_id: user.id,
          _action: 'bank_details_changed',
          _resource_type: 'profile',
          _details: { cooldown_until: cooldownUntil },
        });
        
        result = { 
          success: true, 
          cooldown_until: cooldownUntil,
          message: 'Withdrawals are restricted for 24 hours after bank details change',
        };
        break;
      }

      // ==================== Credit Score ====================
      case 'update_score': {
        // This is typically called internally, but can be triggered by admins
        if (!user) throw new Error('Authentication required');
        
        const { target_user_id, change_amount, reason, reference_type, reference_id } = params;
        
        // Only admins can update other users' scores
        const { data: isAdminResult } = await supabase.rpc('is_admin');
        const targetUserId = isAdminResult ? (target_user_id || user.id) : user.id;
        
        const { data: scoreResult, error } = await supabase.rpc('update_credit_score', {
          _user_id: targetUserId,
          _change_amount: change_amount,
          _change_reason: reason,
          _reference_type: reference_type || null,
          _reference_id: reference_id || null,
        });
        
        if (error) throw error;
        
        result = scoreResult;
        break;
      }

      case 'get_score_history': {
        if (!user) throw new Error('Authentication required');
        
        const { data: history, error } = await supabase
          .from('credit_score_history')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (error) throw error;
        
        result = { success: true, history: history || [] };
        break;
      }

      case 'send_bank_change_otp': {
        if (!user) throw new Error('Authentication required');

        // Get user email
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', user.id)
          .single();

        const userEmail = userProfile?.email || user.email;
        if (!userEmail) throw new Error('No email address found for your account');

        // Check cooldown on bank changes
        const { data: profileCheck } = await supabase
          .from('profiles')
          .select('bank_details_changed_at')
          .eq('id', user.id)
          .single();

        if (profileCheck?.bank_details_changed_at) {
          const changedAt = new Date(profileCheck.bank_details_changed_at).getTime();
          const hoursSince = (Date.now() - changedAt) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            throw new Error(`Bank details can only be changed once every 24 hours. Please try again in ${Math.ceil(24 - hoursSince)} hours.`);
          }
        }

        // Rate limit: max 3 OTPs per hour
        const { count: recentOtps } = await supabase
          .from('bank_change_otps')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

        if ((recentOtps || 0) >= 3) {
          throw new Error('Too many verification attempts. Please wait and try again later.');
        }

        // Generate 6-digit OTP
        const otpDigits = crypto.getRandomValues(new Uint8Array(3));
        const otpCode = ((otpDigits[0] * 65536 + otpDigits[1] * 256 + otpDigits[2]) % 900000 + 100000).toString();

        // Store hashed OTP only — plaintext is sent via email and never persisted
        const otpHash = await hashCode(otpCode);
        await supabase.from('bank_change_otps').insert({
          user_id: user.id,
          otp_code: otpHash, // legacy NOT NULL column — write hash to satisfy constraint
          otp_hash: otpHash,
          email: userEmail,
        });

        // Send email via Resend
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        if (!RESEND_API_KEY) {
          throw new Error('Email service not configured');
        }

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'WeSave <noreply@wesave.ng>',
            to: [userEmail],
            subject: 'WeSave — Bank Change Verification Code',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1a1a1a;">Bank Detail Change Verification</h2>
                <p>You requested to change your bank details on WeSave. Use the code below to verify this action:</p>
                <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${otpCode}</span>
                </div>
                <p style="color: #666; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, please ignore this email and secure your account.</p>
                <p style="color: #999; font-size: 12px; margin-top: 30px;">— WeSave Team</p>
              </div>
            `,
          }),
        });

        if (!emailRes.ok) {
          const emailError = await emailRes.text();
          console.error('Resend email error:', emailError);
          throw new Error('Failed to send verification email');
        }

        result = { success: true, message: 'Verification code sent to your email' };
        break;
      }

      case 'verify_bank_change_otp': {
        if (!user) throw new Error('Authentication required');

        const { otp_code } = params;
        if (!otp_code || otp_code.length !== 6) throw new Error('Invalid verification code');

        // Pull the most recent unverified OTP for this user
        const { data: otpRecord } = await supabase
          .from('bank_change_otps')
          .select('*')
          .eq('user_id', user.id)
          .eq('verified', false)
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!otpRecord) {
          throw new Error('Invalid or expired verification code. Please request a new one.');
        }

        // Per-OTP attempt limit (defense against brute-force within the 5-min window)
        if ((otpRecord.attempt_count || 0) >= 5) {
          await supabase
            .from('bank_change_otps')
            .update({ verified: true })
            .eq('id', otpRecord.id);
          throw new Error('Too many failed attempts. Please request a new verification code.');
        }

        // Constant-time-ish hash comparison
        const submittedHash = await hashCode(otp_code);
        const storedHash = otpRecord.otp_hash || otpRecord.otp_code;
        if (submittedHash !== storedHash) {
          await supabase
            .from('bank_change_otps')
            .update({ attempt_count: (otpRecord.attempt_count || 0) + 1 })
            .eq('id', otpRecord.id);
          throw new Error('Invalid or expired verification code. Please request a new one.');
        }

        // Mark as verified
        await supabase
          .from('bank_change_otps')
          .update({ verified: true })
          .eq('id', otpRecord.id);

        result = { success: true };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Security error:', error);
    
    let userMessage = 'Something went wrong. Please try again or contact support.';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('authentication required'))
        userMessage = 'Your session has expired. Please log in again.';
      else if (msg.includes('too many'))
        userMessage = error.message;
      else if (msg.includes('invalid') || msg.includes('expired'))
        userMessage = error.message;
      else if (msg.includes('cooldown') || msg.includes('24 hours'))
        userMessage = error.message;
      else if (msg.includes('email service'))
        userMessage = 'We could not send the verification email. Please try again later.';
      else if (msg.includes('not found'))
        userMessage = error.message;
      else
        userMessage = error.message;
    }
    
    return new Response(JSON.stringify({
      success: false,
      error: userMessage,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
