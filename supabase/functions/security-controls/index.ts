import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encode as base32Encode, decode as base32Decode } from "https://deno.land/std@0.177.0/encoding/base32.ts";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://thrift-harmony-hub.lovable.app',
  'https://id-preview--52f5b582-a468-4659-81c8-2245803e62d4.lovable.app',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || '') ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
  };
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

async function verifyTOTP(secret: Uint8Array, token: string, window = 1): Promise<boolean> {
  const counter = Math.floor(Date.now() / 1000 / 30);
  
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
  
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
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
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
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
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      if (!authError && authUser) {
        user = authUser;
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
        const secretBase32 = base32Encode(secretBytes);
        
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
        const secretBytes = base32Decode(secretBase32);
        
        const isValid = await verifyTOTP(secretBytes, token);
        
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
        const secretBytes = base32Decode(secretBase32);
        
        let isValid = await verifyTOTP(secretBytes, token);
        
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
        const secretBytes = base32Decode(secretBase32);
        const isValid = await verifyTOTP(secretBytes, token);
        
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
          
          // Register new device
          await supabase
            .from('user_devices')
            .insert({
              user_id: user.id,
              device_fingerprint: fingerprint,
              device_name: device_name || 'Unknown Device',
              browser: browser || null,
              os: os || null,
              ip_address: ip_address || null,
              is_trusted: false,
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
            _details: { fingerprint, device_name, browser, os },
          });
          
          result = { 
            success: true, 
            is_new_device: true, 
            is_trusted: false,
            requires_verification: true,
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
          .select('id, device_name, browser, os, is_trusted, is_current, last_used_at, created_at')
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

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Security error:', error);
    
    let userMessage = 'An error occurred';
    if (error instanceof Error) {
      userMessage = error.message;
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: userMessage 
    }), {
      status: 400,
      headers: { ...getCorsHeaders(null), 'Content-Type': 'application/json' },
    });
  }
});
