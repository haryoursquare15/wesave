import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};


// AES-256-GCM encryption using Web Crypto API
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('ENCRYPTION_KEY');
  if (!keyHex) {
    throw new Error('Encryption key not configured');
  }
  
  // Strip any non-hex chars (quotes, whitespace, dashes) for safety
  const cleanHex = keyHex.replace(/[^0-9a-fA-F]/g, '');
  console.info(`ENCRYPTION_KEY: len=${keyHex.length}, cleanLen=${cleanHex.length}, first10=${cleanHex.slice(0,10)}`);
  if (cleanHex.length !== 64) {
    console.error(`ENCRYPTION_KEY invalid: cleanLen=${cleanHex.length} (need 64 for AES-256)`);
    throw new Error('Encryption key length invalid');
  }
  
  const keyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  return await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  
  // Decode base64 and split IV + ciphertext
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

// Mask sensitive data for display (show last 4 chars only)
function maskSensitive(value: string, showLast = 4): string {
  if (!value || value.length <= showLast) {
    return '*'.repeat(value?.length || 0);
  }
  return '*'.repeat(value.length - showLast) + value.slice(-showLast);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authentication required');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    const { action, ...params } = await req.json();
    console.log(`Encryption action: ${action} for user: ${user.id}`);

    let result;

    switch (action) {
      case 'encrypt_profile_pii': {
        // Encrypt and store sensitive profile data
        const { bvn, bank_account, bank_name, phone } = params;
        
        const encryptedData: Record<string, string | null> = {};
        
        if (bvn) {
          encryptedData.bvn_encrypted = await encrypt(bvn);
          encryptedData.bvn = null; // Clear plaintext
        }
        if (bank_account) {
          encryptedData.bank_account_encrypted = await encrypt(bank_account);
          encryptedData.bank_account = null;
        }
        if (bank_name) {
          encryptedData.bank_name_encrypted = await encrypt(bank_name);
          encryptedData.bank_name = null;
        }
        if (phone) {
          encryptedData.phone_encrypted = await encrypt(phone);
          encryptedData.phone = null;
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update(encryptedData)
          .eq('id', user.id);

        if (updateError) {
          console.error('Failed to update profile:', updateError);
          throw new Error('Failed to save encrypted data');
        }

        result = { 
          success: true, 
          message: 'Sensitive data encrypted and stored securely' 
        };
        break;
      }

      case 'decrypt_profile_pii': {
        // Decrypt and return sensitive profile data (for authorized use only)
        const { data: profile, error: fetchError } = await supabase
          .from('profiles')
          .select('bvn_encrypted, bank_account_encrypted, bank_name_encrypted, phone_encrypted')
          .eq('id', user.id)
          .single();

        if (fetchError || !profile) {
          throw new Error('Profile not found');
        }

        const decryptedData: Record<string, string | null> = {};
        
        if (profile.bvn_encrypted) {
          decryptedData.bvn = await decrypt(profile.bvn_encrypted);
        }
        if (profile.bank_account_encrypted) {
          decryptedData.bank_account = await decrypt(profile.bank_account_encrypted);
        }
        if (profile.bank_name_encrypted) {
          decryptedData.bank_name = await decrypt(profile.bank_name_encrypted);
        }
        if (profile.phone_encrypted) {
          decryptedData.phone = await decrypt(profile.phone_encrypted);
        }

        // Log access for audit trail
        console.log(`PII accessed by user: ${user.id} at ${new Date().toISOString()}`);

        result = { 
          success: true, 
          data: decryptedData 
        };
        break;
      }

      case 'get_masked_profile': {
        // Get masked version of sensitive data for display
        const { data: profile, error: fetchError } = await supabase
          .from('profiles')
          .select('bvn_encrypted, bank_account_encrypted, bank_name_encrypted, phone_encrypted')
          .eq('id', user.id)
          .single();

        if (fetchError || !profile) {
          throw new Error('Profile not found');
        }

        const maskedData: Record<string, string | null> = {};
        
        if (profile.bvn_encrypted) {
          const bvn = await decrypt(profile.bvn_encrypted);
          maskedData.bvn_masked = maskSensitive(bvn, 4);
        }
        if (profile.bank_account_encrypted) {
          const bankAccount = await decrypt(profile.bank_account_encrypted);
          maskedData.bank_account_masked = maskSensitive(bankAccount, 4);
        }
        if (profile.bank_name_encrypted) {
          // Bank name doesn't need masking
          maskedData.bank_name = await decrypt(profile.bank_name_encrypted);
        }
        if (profile.phone_encrypted) {
          const phone = await decrypt(profile.phone_encrypted);
          maskedData.phone_masked = maskSensitive(phone, 4);
        }

        result = { 
          success: true, 
          data: maskedData 
        };
        break;
      }

      case 'backfill_all_pii': {
        // One-time admin-only backfill: encrypt any plaintext bvn, bank_account,
        // phone, id_number into *_encrypted columns where the encrypted value is
        // missing. Does NOT null plaintext (drop migration handles removal).
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        const isSuper = (roles || []).some((r: { role: string }) => r.role === 'super_admin');
        if (!isSuper) throw new Error('Authentication required');

        const { data: rows, error: rowsErr } = await supabase
          .from('profiles')
          .select('id, bvn, bvn_encrypted, bank_account, bank_account_encrypted, bank_name, bank_name_encrypted, phone, phone_encrypted, id_number, id_number_encrypted');
        if (rowsErr) throw new Error('Failed to load profiles');

        let updated = 0;
        for (const row of rows || []) {
          const patch: Record<string, string> = {};
          if (row.bvn && !row.bvn_encrypted) patch.bvn_encrypted = await encrypt(row.bvn);
          if (row.bank_account && !row.bank_account_encrypted) patch.bank_account_encrypted = await encrypt(row.bank_account);
          if (row.bank_name && !row.bank_name_encrypted) patch.bank_name_encrypted = await encrypt(row.bank_name);
          if (row.phone && !row.phone_encrypted) patch.phone_encrypted = await encrypt(row.phone);
          if (row.id_number && !row.id_number_encrypted) patch.id_number_encrypted = await encrypt(row.id_number);
          if (Object.keys(patch).length) {
            const { error: upErr } = await supabase.from('profiles').update(patch).eq('id', row.id);
            if (upErr) {
              console.error('Backfill row failed', row.id, upErr.message);
              continue;
            }
            updated++;
          }
        }
        console.log(`PII backfill done by ${user.id}: ${updated} rows`);
        result = { success: true, updated, scanned: rows?.length || 0 };
        break;
      }

      default:
        throw new Error('Invalid operation');
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Encryption error:', error);
    
    let userMessage = 'An error occurred processing your request';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('authentication')) {
        userMessage = 'Authentication required';
      } else if (msg.includes('not found')) {
        userMessage = 'Profile not found';
      } else if (msg.includes('encryption key')) {
        userMessage = 'Security configuration error';
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: userMessage 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
