import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";
const PLATFORM_BANK_CODE = "044";
const PLATFORM_ACCOUNT_NUMBER = Deno.env.get('PLATFORM_BANK_ACCOUNT') || "";

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
    if (!authHeader) throw new Error('No authorization header');

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Unauthorized');

    const { action, ...params } = await req.json();
    console.log(`Contribution action: ${action} for user: ${user.id}`);

    let result;

    switch (action) {
      case 'initiate_contribution': {
        const { groupId, amount } = params;
        if (!groupId || !amount) throw new Error('Group ID and amount are required');

        const { data: contribResult, error: rpcError } = await supabase.rpc('process_contribution_atomic', { _user_id: user.id, _group_id: groupId, _amount: amount });

        if (rpcError) throw new Error('Failed to process contribution');
        if (!contribResult.success) {
          const errorMsg = contribResult.error || 'Contribution failed';
          if (errorMsg === 'No active cycle') throw new Error('No active contribution cycle.');
          if (errorMsg === 'Already contributed') throw new Error('You have already contributed to this cycle.');
          if (errorMsg === 'Insufficient funds') throw new Error('Insufficient wallet balance.');
          throw new Error(errorMsg);
        }

        await supabase.from('chat_messages').insert({ group_id: groupId, user_id: user.id, message: `has contributed ₦${amount.toLocaleString()} to the pool`, message_type: 'contribution_status' });

        result = { ...contribResult, message: contribResult.all_contributed ? 'All members have contributed!' : 'Contribution recorded successfully' };
        break;
      }

      case 'process_payout': {
        const { groupId } = params;
        if (!groupId) throw new Error('Group ID is required');

        const FLUTTERWAVE_SECRET_KEY = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
        if (!FLUTTERWAVE_SECRET_KEY) throw new Error('FLUTTERWAVE_SECRET_KEY is not configured');

        const { data: payoutResult, error: rpcError } = await supabase.rpc('process_payout_atomic', { _admin_id: user.id, _group_id: groupId });

        if (rpcError) throw new Error('Failed to process payout');
        if (!payoutResult.success) throw new Error(payoutResult.error || 'Payout failed');

        if (payoutResult.platform_fee > 0) {
          const { error: feeError } = await supabase.rpc('record_platform_fee', { _amount: payoutResult.platform_fee, _source_type: 'payout', _source_id: groupId, _source_user_id: payoutResult.recipient_id, _source_group_id: groupId });
          if (feeError) console.error('Failed to record fee:', feeError);

          await supabase.from('transactions').update({ status: 'completed', description: 'Platform service fee' }).eq('group_id', groupId).eq('type', 'service_fee').eq('status', 'pending');

          if (PLATFORM_ACCOUNT_NUMBER && payoutResult.platform_fee >= 100) {
            const transferRef = `fee-${groupId}-${Date.now()}`;
            await fetch(`${FLUTTERWAVE_BASE_URL}/transfers`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ account_bank: PLATFORM_BANK_CODE, account_number: PLATFORM_ACCOUNT_NUMBER, amount: payoutResult.platform_fee, currency: 'NGN', narration: `ThriftPal fee - ${groupId}`, reference: transferRef, debit_currency: 'NGN' }),
            });
          }
        }

        result = payoutResult;
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Contribution error:', error);
    let userMessage = 'An error occurred';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('no active')) userMessage = 'No active contribution cycle.';
      else if (msg.includes('already contributed')) userMessage = 'You have already contributed.';
      else if (msg.includes('insufficient')) userMessage = 'Insufficient wallet balance.';
      else if (msg.includes('unauthorized')) userMessage = 'Authentication required';
    }
    return new Response(JSON.stringify({ success: false, error: userMessage }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
