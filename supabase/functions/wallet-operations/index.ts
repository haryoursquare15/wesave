import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};


const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

// AES-256-GCM decryption (same approach as encryption-utils)
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('ENCRYPTION_KEY');
  if (!keyHex) throw new Error('ENCRYPTION_KEY is not configured');

  // Strip non-hex (quotes, whitespace, dashes)
  const cleanHex = keyHex.replace(/[^0-9a-fA-F]/g, '');
  console.info(`ENCRYPTION_KEY: len=${keyHex.length}, cleanLen=${cleanHex.length}`);
  if (cleanHex.length !== 64) {
    console.error(`ENCRYPTION_KEY invalid: cleanLen=${cleanHex.length} (need 64 for AES-256)`);
    throw new Error('Encryption key length invalid');
  }

  const keyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  return await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

function isGoogleAuthenticated(user: any): boolean {
  const provider = user?.app_metadata?.provider;
  if (provider === 'google') return true;

  const identities = user?.identities as Array<{ provider?: string }> | undefined;
  return Array.isArray(identities) && identities.some(i => i.provider === 'google');
}

async function resolveFlutterwaveBankCode(flutterwaveKey: string, bankName: string): Promise<string | null> {
  const res = await fetch(`${FLUTTERWAVE_BASE_URL}/banks/NG`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${flutterwaveKey}` },
  });

  const payload = await res.json();
  const banks: Array<{ name?: string; code?: string }> = payload?.data || [];

  const normalized = bankName.trim().toLowerCase();
  const exact = banks.find(b => (b.name || '').trim().toLowerCase() === normalized);
  if (exact?.code) return exact.code;

  const contains = banks.find(b => (b.name || '').trim().toLowerCase().includes(normalized));
  return contains?.code || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const FLUTTERWAVE_SECRET_KEY = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!FLUTTERWAVE_SECRET_KEY) {
      throw new Error('FLUTTERWAVE_SECRET_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, ...params } = await req.json();
    console.log(`Processing wallet action: ${action} for user: ${user.id}`);

    let result;

    switch (action) {
      case 'fund_wallet': {
        const { amount } = params;
        if (!amount || amount < 100) {
          throw new Error('Minimum funding amount is ₦100');
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        const txRef = `fund-${user.id}-${Date.now()}`;

        const paymentLinkResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/payments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tx_ref: txRef,
            amount: amount,
            currency: 'NGN',
            redirect_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/flutterwave-webhook?type=funding_redirect`,
            customer: {
              email: user.email,
              phonenumber: profile?.phone || '',
              name: profile?.full_name || 'User',
            },
            customizations: {
              title: 'ThriftPal Wallet Funding',
              description: 'Add funds to your ThriftPal wallet',
              logo: 'https://thriftpal.app/logo.png',
            },
            meta: {
              user_id: user.id,
              type: 'wallet_funding',
            },
          }),
        });

        const paymentData = await paymentLinkResponse.json();
        console.log('Payment link response:', JSON.stringify(paymentData));

        if (paymentData.status !== 'success') {
          throw new Error(paymentData.message || 'Failed to generate payment link');
        }

        await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            type: 'funding',
            amount: amount,
            status: 'pending',
            reference: txRef,
            description: 'Wallet funding',
          });

        result = {
          success: true,
          payment_link: paymentData.data.link,
          tx_ref: txRef,
        };
        break;
      }

      case 'verify_transaction': {
        const { tx_ref } = params;
        if (!tx_ref) {
          throw new Error('Transaction reference is required');
        }

        const verifyResponse = await fetch(
          `${FLUTTERWAVE_BASE_URL}/transactions/verify_by_reference?tx_ref=${tx_ref}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            },
          }
        );

        const verifyData = await verifyResponse.json();
        console.log('Verification response:', JSON.stringify(verifyData));

        if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
          const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_atomic', {
            _user_id: user.id,
            _amount: verifyData.data.amount,
            _tx_ref: tx_ref,
            _description: 'Wallet funding',
          });

          if (creditError) {
            console.error('Credit wallet error:', creditError);
            result = { success: false, error: 'Failed to credit wallet' };
          } else if (!creditResult?.success) {
            result = { success: false, error: creditResult?.error || 'Failed to credit wallet' };
          } else {
            result = {
              success: true,
              message: creditResult.duplicate ? 'Transaction already processed' : 'Payment verified and wallet credited',
              amount: verifyData.data.amount,
              new_balance: creditResult.new_balance,
              verified: true,
              already_completed: creditResult.duplicate || false,
            };
          }
        } else if (verifyData.data?.status === 'failed') {
          await supabase.from('transactions').update({ status: 'failed' }).eq('reference', tx_ref);
          result = { success: false, error: 'Payment failed', verified: true };
        } else {
          result = { success: false, error: 'Payment verification pending', status: verifyData.data?.status || 'unknown', verified: false };
        }
        break;
      }

      case 'withdraw_to_bank': {
        const { amount, token } = params as { amount?: number; token?: string };

        if (!amount || amount < 100) {
          throw new Error('Minimum withdrawal amount is ₦100');
        }

        // Enforce Google auth for withdrawals
        if (!isGoogleAuthenticated(user)) {
          result = { success: false, code: 'google_required', error: 'Google sign-in is required for withdrawals' };
          break;
        }

        if (!token) {
          throw new Error('2FA token is required');
        }

        // Verify 2FA (if enabled) using the same security function
        const { data: verify2FAData, error: verify2FAError } = await supabase.functions.invoke('security-controls', {
          body: { action: 'verify_2fa', token, purpose: 'withdrawal' },
          headers: { Authorization: authHeader },
        });

        if (verify2FAError) {
          throw new Error('Failed to verify 2FA');
        }

        if (!verify2FAData?.verified) {
          throw new Error(verify2FAData?.error || 'Invalid 2FA code');
        }

        // Confirm balance is sufficient (quick check before atomic debit)
        const { data: walletRow, error: walletError } = await supabase
          .from('wallets')
          .select('available_balance')
          .eq('user_id', user.id)
          .single();

        if (walletError || !walletRow) {
          throw new Error('Unable to read wallet balance');
        }

        const available = Number(walletRow.available_balance || 0);
        if (amount > available) {
          throw new Error('Insufficient wallet balance');
        }

        // Fetch bank details (encrypted preferred)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('bank_name, bank_account, bank_name_encrypted, bank_account_encrypted')
          .eq('id', user.id)
          .single();

        if (profileError || !profile) {
          throw new Error('Profile not found');
        }

        let bankName = profile.bank_name as string | null;
        let accountNumber = profile.bank_account as string | null;

        if (profile.bank_name_encrypted) {
          bankName = await decrypt(profile.bank_name_encrypted as string);
        }
        if (profile.bank_account_encrypted) {
          accountNumber = await decrypt(profile.bank_account_encrypted as string);
        }

        if (!bankName || !accountNumber) {
          throw new Error('Withdrawal bank details are missing. Please set your bank details first.');
        }

        const bankCode = await resolveFlutterwaveBankCode(FLUTTERWAVE_SECRET_KEY, bankName);
        if (!bankCode) {
          throw new Error('Unable to resolve bank code for your selected bank');
        }

        const withdrawRef = `wd-${user.id}-${Date.now()}`;

        // Create a pending transaction record up-front
        await supabase.from('transactions').insert({
          user_id: user.id,
          type: 'withdrawal',
          amount,
          status: 'pending',
          reference: withdrawRef,
          description: 'Withdrawal to bank',
        });

        // Atomic debit via ledger (prevents double-spend)
        const { data: debitResult, error: debitError } = await supabase.rpc('debit_wallet_via_ledger', {
          _user_id: user.id,
          _amount: amount,
          _reference_type: 'withdrawal',
          _reference_id: withdrawRef,
          _description: 'Withdrawal to bank',
        });

        if (debitError || !debitResult?.success) {
          await supabase.from('transactions').update({ status: 'failed', description: 'Withdrawal failed - debit rejected' }).eq('reference', withdrawRef);
          throw new Error(debitResult?.error || 'Unable to debit wallet');
        }

        // Trigger Flutterwave transfer
        const transferResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/transfers`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            account_bank: bankCode,
            account_number: accountNumber,
            amount,
            currency: 'NGN',
            narration: 'ThriftPal withdrawal',
            reference: withdrawRef,
            debit_currency: 'NGN',
          }),
        });

        const transferData = await transferResponse.json();
        console.log('Withdrawal transfer response:', JSON.stringify(transferData));

        if (transferData?.status !== 'success') {
          // Compensate debit if transfer failed
          await supabase.rpc('credit_wallet_via_ledger', {
            _user_id: user.id,
            _amount: amount,
            _reference_type: 'withdrawal_reversal',
            _reference_id: withdrawRef,
            _description: 'Withdrawal reversal (transfer failed)',
          });

          await supabase.from('transactions').update({ status: 'failed', description: 'Withdrawal failed - transfer rejected' }).eq('reference', withdrawRef);

          throw new Error(transferData?.message || 'Transfer failed');
        }

        await supabase.from('transactions').update({ status: 'completed' }).eq('reference', withdrawRef);

        result = {
          success: true,
          reference: withdrawRef,
          message: 'Withdrawal processed',
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Wallet error:', error);
    let userMessage = 'An error occurred';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('unauthorized')) userMessage = 'Authentication required';
      else if (msg.includes('minimum')) userMessage = 'Amount does not meet minimum requirements';
      else userMessage = error.message;
    }
    return new Response(JSON.stringify({ success: false, error: userMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
