import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
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
        const { groupId } = params;
        if (!groupId) throw new Error('Group ID is required');

        // The contribution amount is never taken from the caller: it is the
        // group's configured amount, read server-side.
        const { data: group, error: groupError } = await supabase
          .from('thrift_groups')
          .select('id, contribution_amount')
          .eq('id', groupId)
          .maybeSingle();

        if (groupError || !group) throw new Error('Group not found');

        const amount = Number(group.contribution_amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('This group does not have a valid contribution amount set.');
        }

        // Wallet-only contribution — no card fallback
        const { data: contribResult, error: rpcError } = await supabase.rpc('process_contribution_ledger_atomic', {
          _user_id: user.id,
          _group_id: groupId,
          _amount: amount,
        });

        if (rpcError) {
          console.error('Contribution RPC error:', rpcError);
          throw new Error('Failed to process contribution');
        }

        if (!contribResult || !contribResult.success) {
          const errorMsg = contribResult?.error || 'Contribution failed';

          if (errorMsg === 'Insufficient funds') {
            throw new Error('Insufficient wallet balance. Please fund your wallet first.');
          }
          if (errorMsg === 'No active cycle') throw new Error('No active contribution cycle.');
          if (errorMsg === 'Already contributed') throw new Error('You have already contributed to this cycle.');
          throw new Error(errorMsg);
        }

        await supabase.from('chat_messages').insert({
          group_id: groupId,
          user_id: user.id,
          message: `has contributed ₦${Number(amount).toLocaleString()} to the pool`,
          message_type: 'contribution_status',
        });

        // Notify user of successful contribution
        await supabase.from('user_notifications').insert({
          user_id: user.id,
          title: 'Contribution Successful',
          message: `Your contribution of ₦${Number(amount).toLocaleString()} has been recorded.`,
          notification_type: 'contribution_success',
          group_id: groupId,
        });

        result = {
          ...contribResult,
          payment_source: 'wallet',
          message: contribResult.all_contributed ? 'All members have contributed!' : 'Contribution recorded successfully',
        };
        break;
      }

      case 'process_payout': {
        const { groupId } = params;
        if (!groupId) throw new Error('Group ID is required');

        const { data: payoutResult, error: rpcError } = await supabase.rpc('process_payout_atomic', { _admin_id: user.id, _group_id: groupId });

        if (rpcError) throw new Error('Failed to process payout');
        if (!payoutResult.success) throw new Error(payoutResult.error || 'Payout failed');

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
      else if (msg.includes('insufficient')) userMessage = error.message;
      else if (msg.includes('unauthorized')) userMessage = 'Authentication required';
      else userMessage = error.message;
    }
    return new Response(JSON.stringify({ success: false, error: userMessage }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
