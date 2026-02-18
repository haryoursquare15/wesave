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

  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\b(plc|limited|ltd|microfinance|mfb|mfbank)\b/g, "")
      .replace(/[^a-z0-9]/g, "");

  const target = normalize(bankName);

  // Try strict normalized match first
  const exact = banks.find((b) => normalize(b.name || "") === target);
  if (exact?.code) return exact.code;

  // Then try partial matches (in either direction)
  const contains = banks.find((b) => {
    const candidate = normalize(b.name || "");
    return candidate.includes(target) || target.includes(candidate);
  });

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

    const { action, ...params } = await req.json();
    console.log(`Processing wallet action: ${action}`);

    // Bank validation doesn't require auth (needed during onboarding before full session)
    if (action === 'validate_bank_account') {
      const { bank_name, account_number } = params;
      if (!bank_name || !account_number) {
        throw new Error('Bank name and account number are required');
      }

      if (account_number.length !== 10) {
        throw new Error('Account number must be 10 digits');
      }

      // Resolve bank code from Flutterwave
      const bankCode = await resolveFlutterwaveBankCode(FLUTTERWAVE_SECRET_KEY, bank_name);
      if (!bankCode) {
        throw new Error('Unable to find bank. Please select a valid Nigerian bank.');
      }

      // Verify account with Flutterwave
      const verifyRes = await fetch(`${FLUTTERWAVE_BASE_URL}/accounts/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_number,
          account_bank: bankCode,
        }),
      });

      const verifyData = await verifyRes.json();
      console.log('Bank verification response:', JSON.stringify(verifyData));

      if (verifyData.status !== 'success') {
        throw new Error(verifyData.message || 'Unable to verify bank account');
      }

      return new Response(JSON.stringify({
        success: true,
        account_name: verifyData.data?.account_name || '',
        bank_name: bank_name,
        account_number: account_number,
        verified: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // TEMPORARY: Reconcile withdrawals (no auth required, token-gated)
    if (action === 'reconcile_now') {
      const TEMP_TEST_TOKEN = 'wesave-test-wd-2026-02-18';
      if (params.test_token !== TEMP_TEST_TOKEN) {
        throw new Error('Unauthorized test call');
      }

      const { data: staleWithdrawals } = await supabase
        .from('transactions')
        .select('reference, amount, user_id')
        .eq('type', 'withdrawal')
        .eq('status', 'processing');

      const reconciled: string[] = [];
      for (const tx of staleWithdrawals || []) {
        try {
          const checkRes = await fetch(
            `${FLUTTERWAVE_BASE_URL}/transfers?reference=${tx.reference}`,
            { headers: { 'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}` } }
          );
          const checkData = await checkRes.json();
          console.log(`Reconcile check for ${tx.reference}:`, JSON.stringify(checkData));
          const transfer = checkData?.data?.[0];

          if (!transfer) continue;

          const frozenAmount = Number(tx.amount);

          if (transfer.status === 'SUCCESSFUL') {
            await supabase.rpc('confirm_withdrawal_debit', {
              _user_id: tx.user_id,
              _amount: frozenAmount,
              _reference: tx.reference,
              _description: `Withdrawal confirmed — ₦${transfer.amount} sent to bank`,
            });
            await supabase.from('transactions').update({ status: 'completed', description: `Withdrawal completed — ₦${transfer.amount} sent to bank` }).eq('reference', tx.reference);
            reconciled.push(tx.reference!);
          } else if (transfer.status === 'FAILED') {
            await supabase.rpc('release_withdrawal_freeze', {
              _user_id: tx.user_id,
              _amount: frozenAmount,
              _reference: tx.reference,
              _description: `Withdrawal failed — funds released (${transfer.complete_message || transfer.status})`,
            });
            await supabase.from('transactions').update({ status: 'failed', description: `Withdrawal failed — ${transfer.complete_message || 'transfer unsuccessful'}` }).eq('reference', tx.reference);
            reconciled.push(tx.reference!);
          }
        } catch (e) {
          console.error(`Reconciliation error for ${tx.reference}:`, e);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        checked: staleWithdrawals?.length || 0,
        reconciled: reconciled.length,
        references: reconciled,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // TEMPORARY: Direct test withdrawal (no auth required, token-gated)
    if (action === 'test_withdraw_direct') {
      const TEMP_TEST_TOKEN = 'wesave-test-wd-2026-02-18';
      if (params.test_token !== TEMP_TEST_TOKEN) {
        throw new Error('Unauthorized test call');
      }

      const testUserId = params.user_id as string;
      const testAmount = Number(params.amount);
      if (!testUserId || !testAmount || testAmount < 200) {
        throw new Error('user_id and amount (min 200) required');
      }

      console.log(`[TEST WITHDRAW] Starting for user ${testUserId}, amount ₦${testAmount}`);

      const { data: testProfile } = await supabase
        .from('profiles')
        .select('bank_name, bank_account, bank_name_encrypted, bank_account_encrypted, full_name')
        .eq('id', testUserId)
        .single();

      if (!testProfile) throw new Error('Profile not found');

      let testBankName = testProfile.bank_name as string | null;
      let testAccountNumber = testProfile.bank_account as string | null;

      if (testProfile.bank_name_encrypted) {
        testBankName = await decrypt(testProfile.bank_name_encrypted as string);
      }
      if (testProfile.bank_account_encrypted) {
        testAccountNumber = await decrypt(testProfile.bank_account_encrypted as string);
      }

      console.log(`[TEST WITHDRAW] Bank: ${testBankName}, Account: ****${testAccountNumber?.slice(-4)}`);
      if (!testBankName || !testAccountNumber) throw new Error('Bank details missing');

      const testBankCode = await resolveFlutterwaveBankCode(FLUTTERWAVE_SECRET_KEY, testBankName);
      if (!testBankCode) throw new Error(`Cannot resolve bank code for ${testBankName}`);
      console.log(`[TEST WITHDRAW] Resolved bank code: ${testBankCode}`);

      const TEST_FEE = 100;
      const testTransferAmount = testAmount - TEST_FEE;
      const testRef = `wd-${testUserId}-${Date.now()}`;

      // STEP 1: Freeze
      console.log(`[TEST WITHDRAW] Freezing ₦${testAmount}...`);
      const { data: testFreezeResult, error: testFreezeError } = await supabase.rpc('freeze_wallet_for_withdrawal', {
        _user_id: testUserId,
        _amount: testAmount,
        _reference: testRef,
        _description: `TEST withdrawal freeze (₦${TEST_FEE} fee)`,
      });

      if (testFreezeError || !testFreezeResult?.success) {
        console.error(`[TEST WITHDRAW] Freeze failed:`, testFreezeError, testFreezeResult);
        throw new Error(testFreezeResult?.error || 'Freeze failed');
      }
      console.log(`[TEST WITHDRAW] Freeze OK:`, JSON.stringify(testFreezeResult));

      await supabase.from('transactions').insert({
        user_id: testUserId, type: 'withdrawal', amount: testAmount,
        status: 'pending', reference: testRef,
        description: `TEST Withdrawal to bank (₦${TEST_FEE} fee)`,
      });

      // STEP 2: Verify bank
      console.log(`[TEST WITHDRAW] Verifying bank account...`);
      const testVerifyRes = await fetch(`${FLUTTERWAVE_BASE_URL}/accounts/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_number: testAccountNumber, account_bank: testBankCode }),
      });
      const testVerifyData = await testVerifyRes.json();
      console.log(`[TEST WITHDRAW] Bank verify response:`, JSON.stringify(testVerifyData));

      if (testVerifyData.status !== 'success') {
        await supabase.rpc('release_withdrawal_freeze', {
          _user_id: testUserId, _amount: testAmount, _reference: testRef,
          _description: 'TEST withdrawal cancelled — bank verify failed',
        });
        await supabase.from('transactions').update({ status: 'failed' }).eq('reference', testRef);
        throw new Error('Bank verification failed: ' + JSON.stringify(testVerifyData));
      }

      const testAccountName = testVerifyData.data?.account_name || '';
      console.log(`[TEST WITHDRAW] Verified account name: ${testAccountName}`);

      // STEP 3: Initiate transfer
      console.log(`[TEST WITHDRAW] Initiating transfer of ₦${testTransferAmount} to ${testAccountName}...`);
      const testTransferRes = await fetch(`${FLUTTERWAVE_BASE_URL}/transfers`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_bank: testBankCode, account_number: testAccountNumber,
          amount: testTransferAmount, currency: 'NGN',
          narration: 'WeSave TEST withdrawal', reference: testRef,
          debit_currency: 'NGN',
          meta: [{ sender: 'WeSave', sender_country: 'NG', mobile_number: '' }],
        }),
      });

      const testTransferData = await testTransferRes.json();
      console.log(`[TEST WITHDRAW] Transfer response:`, JSON.stringify(testTransferData));

      if (testTransferData?.status !== 'success') {
        await supabase.rpc('release_withdrawal_freeze', {
          _user_id: testUserId, _amount: testAmount, _reference: testRef,
          _description: 'TEST withdrawal cancelled — transfer failed',
        });
        await supabase.from('transactions').update({ status: 'failed' }).eq('reference', testRef);
        throw new Error('Transfer failed: ' + JSON.stringify(testTransferData));
      }

      await supabase.from('transactions').update({
        status: 'processing',
        description: `TEST Withdrawal processing — ₦${testTransferAmount} to ${testAccountName} (${testBankName})`,
      }).eq('reference', testRef);

      await supabase.rpc('record_platform_fee', {
        _amount: TEST_FEE, _source_type: 'withdrawal', _source_id: testRef,
        _source_user_id: testUserId, _source_group_id: null,
      });

      return new Response(JSON.stringify({
        success: true, reference: testRef,
        transfer_id: testTransferData.data?.id,
        transfer_status: testTransferData.data?.status,
        amount_frozen: testAmount, amount_to_bank: testTransferAmount,
        fee: TEST_FEE, account_name: testAccountName, bank: testBankName,
        full_response: testTransferData,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // All other actions require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`Authenticated user: ${user.id}`);

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

        // Verify 2FA
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

        const WITHDRAWAL_FEE = 100; // ₦100 flat withdrawal fee
        const totalDebit = amount; // Full amount frozen from user
        const transferAmount = amount - WITHDRAWAL_FEE; // Amount sent to bank

        if (transferAmount < 1) {
          throw new Error('Withdrawal amount too low after fees');
        }

        const withdrawRef = `wd-${user.id}-${Date.now()}`;

        // ── STEP 1: FREEZE funds (do NOT deduct yet) ──
        const { data: freezeResult, error: freezeError } = await supabase.rpc('freeze_wallet_for_withdrawal', {
          _user_id: user.id,
          _amount: totalDebit,
          _reference: withdrawRef,
          _description: `Withdrawal freeze (₦${WITHDRAWAL_FEE} fee applies)`,
        });

        if (freezeError || !freezeResult?.success) {
          throw new Error(freezeResult?.error || 'Unable to freeze funds for withdrawal');
        }

        // Create a pending transaction record
        await supabase.from('transactions').insert({
          user_id: user.id,
          type: 'withdrawal',
          amount: totalDebit,
          status: 'pending',
          reference: withdrawRef,
          description: `Withdrawal to bank (₦${WITHDRAWAL_FEE} fee applied)`,
        });

        // ── STEP 2: Verify bank account ──
        const verifyBankRes = await fetch(`${FLUTTERWAVE_BASE_URL}/accounts/resolve`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }),
        });

        const verifyBankData = await verifyBankRes.json();
        if (verifyBankData.status !== 'success') {
          // Release frozen funds and fail
          await supabase.rpc('release_withdrawal_freeze', {
            _user_id: user.id,
            _amount: totalDebit,
            _reference: withdrawRef,
            _description: 'Withdrawal cancelled — bank verification failed',
          });
          await supabase.from('transactions').update({ status: 'failed', description: 'Withdrawal failed — bank verification failed' }).eq('reference', withdrawRef);
          throw new Error('Unable to verify bank account. Please check your details.');
        }

        const verifiedAccountName = verifyBankData.data?.account_name || '';

        // ── STEP 3: Initiate Flutterwave transfer ──
        const transferResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/transfers`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            account_bank: bankCode,
            account_number: accountNumber,
            amount: transferAmount,
            currency: 'NGN',
            narration: 'WeSave withdrawal',
            reference: withdrawRef,
            debit_currency: 'NGN',
            meta: [{ sender: 'WeSave', sender_country: 'NG', mobile_number: '' }],
          }),
        });

        const transferData = await transferResponse.json();
        console.log('Withdrawal transfer response:', JSON.stringify(transferData));

        if (transferData?.status !== 'success') {
          // Release frozen funds on API failure
          await supabase.rpc('release_withdrawal_freeze', {
            _user_id: user.id,
            _amount: totalDebit,
            _reference: withdrawRef,
            _description: 'Withdrawal cancelled — transfer initiation failed',
          });
          await supabase.from('transactions').update({ status: 'failed', description: 'Withdrawal failed — transfer rejected' }).eq('reference', withdrawRef);
          throw new Error(transferData?.message || 'Transfer failed');
        }

        // Mark as PROCESSING — final confirmation happens via webhook
        await supabase.from('transactions').update({
          status: 'processing',
          description: `Withdrawal processing — ₦${transferAmount.toLocaleString()} to ${verifiedAccountName} (${bankName})`,
        }).eq('reference', withdrawRef);

        // Record platform withdrawal fee
        const { error: feeError } = await supabase.rpc('record_platform_fee', {
          _amount: WITHDRAWAL_FEE,
          _source_type: 'withdrawal',
          _source_id: withdrawRef,
          _source_user_id: user.id,
          _source_group_id: null,
        });
        if (feeError) console.error('Failed to record withdrawal fee:', feeError);

        // Record Flutterwave transfer expense placeholder
        await supabase.rpc('record_platform_expense', {
          _amount: 0,
          _expense_type: 'transfer_fee',
          _description: `Flutterwave transfer fee for withdrawal ${withdrawRef}`,
          _source_type: 'withdrawal',
          _source_id: withdrawRef,
          _source_user_id: user.id,
        });

        result = {
          success: true,
          reference: withdrawRef,
          message: `Withdrawal initiated. ₦${transferAmount.toLocaleString()} will be sent to ${verifiedAccountName}. You'll be notified when complete.`,
          amount_sent: transferAmount,
          fee: WITHDRAWAL_FEE,
          status: 'processing',
          verified_account_name: verifiedAccountName,
        };
        break;
      }

      // validate_bank_account and test_withdraw_direct are handled before auth check above

      case 'reconcile_withdrawals': {
        // Backup reconciliation: check stale processing withdrawals against Flutterwave
        const { data: staleWithdrawals } = await supabase
          .from('transactions')
          .select('reference, amount, user_id')
          .eq('type', 'withdrawal')
          .eq('status', 'processing')
          .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()); // > 30 min old

        const reconciled: string[] = [];
        for (const tx of staleWithdrawals || []) {
          try {
            const checkRes = await fetch(
              `${FLUTTERWAVE_BASE_URL}/transfers?reference=${tx.reference}`,
              { headers: { 'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}` } }
            );
            const checkData = await checkRes.json();
            const transfer = checkData?.data?.[0];

            if (!transfer) continue;

            const frozenAmount = Number(tx.amount);

            if (transfer.status === 'SUCCESSFUL') {
              await supabase.rpc('confirm_withdrawal_debit', {
                _user_id: tx.user_id,
                _amount: frozenAmount,
                _reference: tx.reference,
                _description: 'Withdrawal confirmed via reconciliation',
              });
              await supabase.from('transactions').update({ status: 'completed', description: 'Withdrawal completed (reconciled)' }).eq('reference', tx.reference);
              reconciled.push(tx.reference!);
            } else if (transfer.status === 'FAILED') {
              await supabase.rpc('release_withdrawal_freeze', {
                _user_id: tx.user_id,
                _amount: frozenAmount,
                _reference: tx.reference,
                _description: 'Withdrawal failed — funds released via reconciliation',
              });
              await supabase.from('transactions').update({ status: 'failed', description: 'Withdrawal failed (reconciled)' }).eq('reference', tx.reference);
              reconciled.push(tx.reference!);
            }
          } catch (e) {
            console.error(`Reconciliation error for ${tx.reference}:`, e);
          }
        }

        result = {
          success: true,
          checked: staleWithdrawals?.length || 0,
          reconciled: reconciled.length,
          references: reconciled,
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
    let userMessage = 'Something went wrong. Please try again later.';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('unauthorized') || msg.includes('no authorization'))
        userMessage = 'Please log in again to continue.';
      else if (msg.includes('minimum'))
        userMessage = 'The amount entered is below the minimum allowed.';
      else if (msg.includes('insufficient'))
        userMessage = 'You don\'t have enough funds for this transaction.';
      else if (msg.includes('bank details are missing'))
        userMessage = 'Please add your bank details before withdrawing.';
      else if (msg.includes('unable to verify bank') || msg.includes('unable to find bank'))
        userMessage = 'We couldn\'t verify your bank account. Please check your details and try again.';
      else if (msg.includes('ip whitelisting'))
        userMessage = 'We\'re experiencing a temporary issue processing transfers. Our team has been notified.';
      else if (msg.includes('transfer failed'))
        userMessage = 'Your withdrawal could not be completed at this time. Please try again shortly.';
      else if (msg.includes('2fa') || msg.includes('token'))
        userMessage = 'Verification failed. Please check your code and try again.';
      else if (msg.includes('google'))
        userMessage = 'Google sign-in is required for withdrawals.';
      else if (msg.includes('unable to debit'))
        userMessage = 'We couldn\'t process this withdrawal. Please try again.';
      else if (msg.includes('too low after fees'))
        userMessage = 'The withdrawal amount is too small after the ₦100 fee is applied.';
      else
        userMessage = 'Something went wrong. Please try again or contact support if the issue persists.';
    }
    return new Response(JSON.stringify({ success: false, error: userMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
