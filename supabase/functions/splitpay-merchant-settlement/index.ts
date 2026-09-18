import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

async function resolveFlutterwaveBankCode(flutterwaveKey: string, bankName: string): Promise<string | null> {
  const res = await fetch(`${FLUTTERWAVE_BASE_URL}/banks/NG`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${flutterwaveKey}` },
  });

  const payload = await res.json();
  const banks: Array<{ name?: string; code?: string }> = payload?.data || [];

  const normalize = (s: string) =>
    s.trim().toLowerCase()
      .replace(/\b(plc|limited|ltd|microfinance|mfb|mfbank)\b/g, "")
      .replace(/[^a-z0-9]/g, "");

  const target = normalize(bankName);

  const exact = banks.find((b) => normalize(b.name || "") === target);
  if (exact?.code) return exact.code;

  const contains = banks.find((b) => {
    const candidate = normalize(b.name || "");
    return candidate.includes(target) || target.includes(candidate);
  });

  return contains?.code || null;
}

/** Constant-time comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Only the DB trigger (shared token) or the service role may initiate a payout. */
async function isInternalCaller(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const bearer = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (serviceKey && bearer && safeEqual(bearer, serviceKey)) return true;

  const provided = req.headers.get('x-cron-token') || '';
  if (!provided) return false;

  const envSecret = Deno.env.get('CRON_SECRET');
  if (envSecret && safeEqual(provided, envSecret)) return true;

  const { data } = await supabase
    .from('internal_cron_tokens')
    .select('token')
    .eq('name', 'splitpay_settlement')
    .maybeSingle();

  return !!data?.token && safeEqual(provided, data.token as string);
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

    if (!(await isInternalCaller(req, supabase))) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ONLY the split id is trusted from the request body. Every payout detail
    // (merchant bank, account, amount, creator) is read from the authoritative
    // split_requests row so a caller can never redirect funds.
    const { split_request_id } = await req.json();

    if (!split_request_id || typeof split_request_id !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'split_request_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: splitRow, error: splitErr } = await supabase
      .from('split_requests')
      .select('id, purpose, creator_user_id, merchant_account_name, merchant_bank_name, merchant_account_number')
      .eq('id', split_request_id)
      .maybeSingle();

    if (splitErr || !splitRow) {
      return new Response(JSON.stringify({ success: false, error: 'Split request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Amount is derived from the verified, completed participant transactions.
    const { data: txRows } = await supabase
      .from('split_transactions')
      .select('amount')
      .eq('split_request_id', split_request_id)
      .eq('status', 'completed');

    const merchant_amount = (txRows ?? []).reduce(
      (sum: number, t: { amount: number | string }) => sum + Number(t.amount || 0),
      0,
    );

    const merchant_name = splitRow.merchant_account_name as string;
    const merchant_bank = splitRow.merchant_bank_name as string;
    const merchant_account = splitRow.merchant_account_number as string;
    const purpose = splitRow.purpose as string;
    const creator_id = splitRow.creator_user_id as string;

    if (!merchant_bank || !merchant_account || merchant_amount <= 0) {
      return new Response(JSON.stringify({ success: false, error: 'Split has no valid merchant payout details' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    console.log(`[SPLIT SETTLEMENT] Processing for split ${split_request_id}`);

    // ATOMIC CLAIM: prevents two concurrent invocations from both initiating
    // a Flutterwave transfer for the same split. The RPC flips
    // settlement_status -> 'processing' only when eligible.
    const { data: claim, error: claimErr } = await supabase.rpc('claim_split_settlement', {
      _split_request_id: split_request_id,
    });

    if (claimErr) {
      throw new Error(`Failed to claim settlement: ${claimErr.message}`);
    }

    if (!claim?.claimed) {
      console.log(`[SPLIT SETTLEMENT] Skipped ${split_request_id}: ${claim?.reason} (status=${claim?.status}, settlement=${claim?.settlement_status})`);
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: claim?.reason || 'not_eligible',
        status: claim?.status,
        settlement_status: claim?.settlement_status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve bank code
    const bankCode = await resolveFlutterwaveBankCode(FLUTTERWAVE_SECRET_KEY, merchant_bank);
    if (!bankCode) {
      const errorMsg = `Could not resolve bank code for "${merchant_bank}"`;
      console.error(`[SPLIT SETTLEMENT] ${errorMsg}`);

      await supabase.from('split_requests').update({
        settlement_status: 'failed',
        settlement_failure_reason: errorMsg,
        updated_at: new Date().toISOString(),
      }).eq('id', split_request_id);

      // Notify creator of failure
      await supabase.from('user_notifications').insert({
        user_id: creator_id,
        title: 'Merchant Settlement Failed',
        message: `We couldn't resolve the bank "${merchant_bank}" for "${purpose}". Please contact support.`,
        notification_type: 'split_settlement_failed',
      });

      throw new Error(errorMsg);
    }

    console.log(`[SPLIT SETTLEMENT] Bank code resolved: ${merchant_bank} → ${bankCode}`);

    // Verify account name before transfer
    const verifyRes = await fetch(`${FLUTTERWAVE_BASE_URL}/accounts/resolve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_number: merchant_account,
        account_bank: bankCode,
      }),
    });

    const verifyData = await verifyRes.json();
    console.log(`[SPLIT SETTLEMENT] Account verification status:`, verifyData?.status);

    if (verifyData.status !== 'success') {
      const errorMsg = `Account verification failed for ${merchant_account} at ${merchant_bank}`;
      
      await supabase.from('split_requests').update({
        settlement_status: 'failed',
        settlement_failure_reason: errorMsg,
        updated_at: new Date().toISOString(),
      }).eq('id', split_request_id);

      await supabase.from('user_notifications').insert({
        user_id: creator_id,
        title: 'Merchant Settlement Failed',
        message: `Account verification failed for "${purpose}". Account: ${merchant_account} at ${merchant_bank}. Please check merchant details.`,
        notification_type: 'split_settlement_failed',
      });

      throw new Error(errorMsg);
    }

    // Generate unique transfer reference
    const transferRef = `split-merchant-${split_request_id}`;

    // Update settlement reference
    await supabase.from('split_requests').update({
      settlement_reference: transferRef,
      settlement_status: 'processing',
      updated_at: new Date().toISOString(),
    }).eq('id', split_request_id);

    // Initiate Flutterwave transfer
    const transferRes = await fetch(`${FLUTTERWAVE_BASE_URL}/transfers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_bank: bankCode,
        account_number: merchant_account,
        amount: merchant_amount,
        currency: 'NGN',
        narration: `Vestara SplitPay settlement for "${purpose}"`,
        reference: transferRef,
        debit_currency: 'NGN',
        meta: [{
          sender: 'Vestara',
          sender_country: 'NG',
          mobile_number: '08000000000',
        }],
      }),
    });

    const transferData = await transferRes.json();
    console.log(`[SPLIT SETTLEMENT] Transfer response:`, JSON.stringify(transferData));

    if (transferData.status === 'success') {
      // Transfer initiated — update with Flutterwave transfer ID
      await supabase.from('split_requests').update({
        settlement_flw_transfer_id: transferData.data?.id?.toString(),
        settlement_status: 'processing',
        updated_at: new Date().toISOString(),
      }).eq('id', split_request_id);

      // Audit trail
      await supabase.from('audit_logs').insert({
        user_id: creator_id,
        action: 'split_merchant_transfer_initiated',
        resource_type: 'split_request',
        resource_id: split_request_id,
        details: {
          amount: merchant_amount,
          merchant_name: merchant_name,
          merchant_bank: merchant_bank,
          merchant_account: merchant_account,
          transfer_reference: transferRef,
          flw_transfer_id: transferData.data?.id,
          verified_account_name: verifyData.data?.account_name,
        },
      });

      console.log(`[SPLIT SETTLEMENT] Transfer initiated: ${transferRef}, FLW ID: ${transferData.data?.id}`);

      return new Response(JSON.stringify({
        success: true,
        transfer_reference: transferRef,
        flw_transfer_id: transferData.data?.id,
        amount: merchant_amount,
        merchant: merchant_name,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      const errorMsg = transferData.message || 'Flutterwave transfer initiation failed';
      console.error(`[SPLIT SETTLEMENT] Transfer failed:`, errorMsg);

      await supabase.from('split_requests').update({
        settlement_status: 'failed',
        settlement_failure_reason: errorMsg,
        updated_at: new Date().toISOString(),
      }).eq('id', split_request_id);

      await supabase.from('user_notifications').insert({
        user_id: creator_id,
        title: 'Merchant Settlement Failed',
        message: `Transfer to ${merchant_name} for "${purpose}" failed: ${errorMsg}. Our team will investigate.`,
        notification_type: 'split_settlement_failed',
      });

      await supabase.from('audit_logs').insert({
        user_id: creator_id,
        action: 'split_merchant_transfer_failed',
        resource_type: 'split_request',
        resource_id: split_request_id,
        details: {
          amount: merchant_amount,
          error: errorMsg,
          transfer_reference: transferRef,
        },
      });

      throw new Error(errorMsg);
    }

  } catch (error: unknown) {
    console.error('[SPLIT SETTLEMENT] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
