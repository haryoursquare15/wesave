import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // ================================================================
    // ACTION: RECONCILE — Called by cron every 3 minutes
    // ================================================================
    if (action === 'reconcile') {
      const flwSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY') || Deno.env.get('FLUTTERWAVE_TEST_SECRET_KEY');
      if (!flwSecret) {
        return new Response(JSON.stringify({ success: false, error: 'No Flutterwave key configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Find pending charges older than 2 minutes
      const { data: pendingCharges } = await supabase
        .from('pending_card_charges')
        .select('*')
        .eq('status', 'pending')
        .lt('created_at', twoMinutesAgo)
        .order('created_at', { ascending: true })
        .limit(50);

      if (!pendingCharges || pendingCharges.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No pending charges to reconcile', processed: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const results = [];
      for (const charge of pendingCharges) {
        const ageMs = Date.now() - new Date(charge.created_at).getTime();
        const isTimedOut = ageMs > 24 * 60 * 60 * 1000;
        const isMaxRetries = charge.retry_count >= charge.max_retries;

        // Mark as unresolved if timed out or max retries
        if (isTimedOut || isMaxRetries) {
          await supabase.from('pending_card_charges').update({
            status: 'unresolved',
            failure_reason: isTimedOut ? 'Timed out after 24 hours' : `Exceeded max retries (${charge.max_retries})`,
            resolved_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
          }).eq('id', charge.id);

          results.push({ tx_ref: charge.tx_ref, status: 'unresolved' });
          continue;
        }

        // Skip if no flw_transaction_id
        if (!charge.flw_transaction_id) {
          await supabase.from('pending_card_charges').update({
            retry_count: charge.retry_count + 1,
            last_checked_at: new Date().toISOString(),
          }).eq('id', charge.id);
          results.push({ tx_ref: charge.tx_ref, status: 'skipped_no_txn_id' });
          continue;
        }

        // Verify with Flutterwave
        try {
          const verifyResp = await fetch(`${FLUTTERWAVE_BASE_URL}/transactions/${charge.flw_transaction_id}/verify`, {
            headers: { 'Authorization': `Bearer ${flwSecret}` },
          });
          const verifyData = await verifyResp.json();

          if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
            // Confirmed! Process the contribution
            await processConfirmedCharge(supabase, charge);
            results.push({ tx_ref: charge.tx_ref, status: 'confirmed' });
          } else if (verifyData.data?.status === 'failed') {
            await supabase.from('pending_card_charges').update({
              status: 'failed',
              failure_reason: verifyData.data?.processor_response || 'Transaction failed',
              resolved_at: new Date().toISOString(),
              last_checked_at: new Date().toISOString(),
            }).eq('id', charge.id);
            results.push({ tx_ref: charge.tx_ref, status: 'failed' });
          } else {
            // Still pending
            await supabase.from('pending_card_charges').update({
              retry_count: charge.retry_count + 1,
              last_checked_at: new Date().toISOString(),
            }).eq('id', charge.id);
            results.push({ tx_ref: charge.tx_ref, status: 'still_pending' });
          }
        } catch (err) {
          console.error(`Verify error for ${charge.tx_ref}:`, err);
          await supabase.from('pending_card_charges').update({
            retry_count: charge.retry_count + 1,
            last_checked_at: new Date().toISOString(),
          }).eq('id', charge.id);
          results.push({ tx_ref: charge.tx_ref, status: 'verify_error' });
        }
      }

      return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: WEBHOOK — Called by Flutterwave webhook for contribution charges
    // ================================================================
    if (action === 'webhook') {
      const { tx_ref, flw_ref, transaction_id, status: txStatus } = body;

      if (!tx_ref) throw new Error('Missing tx_ref');

      // Only process card-contrib transactions
      if (!tx_ref.startsWith('card-contrib-')) {
        return new Response(JSON.stringify({ success: true, message: 'Not a card contribution' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find the pending charge
      const { data: charge } = await supabase
        .from('pending_card_charges')
        .select('*')
        .eq('tx_ref', tx_ref)
        .single();

      if (!charge) {
        console.log(`No pending charge found for tx_ref: ${tx_ref}`);
        return new Response(JSON.stringify({ success: true, message: 'No matching charge' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (charge.status !== 'pending') {
        return new Response(JSON.stringify({ success: true, message: 'Already processed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify with Flutterwave for security
      const flwSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY') || Deno.env.get('FLUTTERWAVE_TEST_SECRET_KEY');
      if (!flwSecret) throw new Error('No Flutterwave key');

      const verifyResp = await fetch(`${FLUTTERWAVE_BASE_URL}/transactions/${transaction_id || charge.flw_transaction_id}/verify`, {
        headers: { 'Authorization': `Bearer ${flwSecret}` },
      });
      const verifyData = await verifyResp.json();

      if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
        // Update flw_transaction_id if we got it from webhook
        if (transaction_id) {
          await supabase.from('pending_card_charges').update({
            flw_transaction_id: transaction_id.toString(),
            flw_ref: flw_ref || charge.flw_ref,
          }).eq('id', charge.id);
          charge.flw_transaction_id = transaction_id.toString();
        }

        await processConfirmedCharge(supabase, charge);
        return new Response(JSON.stringify({ success: true, message: 'Contribution confirmed via webhook' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else if (verifyData.data?.status === 'failed') {
        await supabase.from('pending_card_charges').update({
          status: 'failed',
          failure_reason: verifyData.data?.processor_response || 'Transaction failed',
          resolved_at: new Date().toISOString(),
        }).eq('id', charge.id);
      }

      return new Response(JSON.stringify({ success: true, message: 'Webhook processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: MANUAL_VERIFY — Admin manually verifies a pending charge
    // ================================================================
    if (action === 'manual_verify') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) throw new Error('Unauthorized');

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) throw new Error('Unauthorized');

      const { data: isAdmin } = await supabase.rpc('is_any_admin', { _user_id: user.id });
      if (!isAdmin) throw new Error('Admin access required');

      const { chargeId } = body;
      if (!chargeId) throw new Error('Charge ID required');

      const { data: charge } = await supabase
        .from('pending_card_charges')
        .select('*')
        .eq('id', chargeId)
        .single();

      if (!charge) throw new Error('Charge not found');
      if (charge.status !== 'pending' && charge.status !== 'unresolved') {
        throw new Error('Charge already resolved');
      }

      if (!charge.flw_transaction_id) throw new Error('No transaction ID to verify');

      const flwSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY') || Deno.env.get('FLUTTERWAVE_TEST_SECRET_KEY');
      if (!flwSecret) throw new Error('No Flutterwave key');

      const verifyResp = await fetch(`${FLUTTERWAVE_BASE_URL}/transactions/${charge.flw_transaction_id}/verify`, {
        headers: { 'Authorization': `Bearer ${flwSecret}` },
      });
      const verifyData = await verifyResp.json();

      if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
        await processConfirmedCharge(supabase, charge);
        return new Response(JSON.stringify({ success: true, message: 'Charge confirmed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: false,
        error: `Transaction status: ${verifyData.data?.status || 'unknown'}`,
        flw_status: verifyData.data?.status,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: unknown) {
    console.error('Contribution reconciliation error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ========================================================================
// Process a confirmed card charge — credit wallet, process contribution
// ========================================================================
async function processConfirmedCharge(
  supabase: ReturnType<typeof createClient>,
  charge: Record<string, unknown>,
) {
  const userId = charge.user_id as string;
  const groupId = charge.group_id as string;
  const cycleId = charge.cycle_id as string;
  const amount = charge.amount as number;
  const txRef = charge.tx_ref as string;

  // Idempotency: check if already processed
  const { data: existingContrib } = await supabase
    .from('cycle_contributions')
    .select('id')
    .eq('cycle_id', cycleId)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .single();

  if (existingContrib) {
    // Already processed, just update pending_card_charges
    await supabase.from('pending_card_charges').update({
      status: 'successful',
      verified_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    }).eq('id', charge.id as string);
    return;
  }

  // Credit wallet
  const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_atomic', {
    _user_id: userId,
    _amount: amount,
    _tx_ref: txRef,
    _description: 'Card charge confirmed — contribution funding',
  });

  if (creditError || !creditResult?.success) {
    console.error('Wallet credit failed for confirmed charge:', creditError);
    return;
  }

  // Process contribution
  const { data: contribResult, error: contribError } = await supabase.rpc('process_contribution_ledger_atomic', {
    _user_id: userId,
    _group_id: groupId,
    _amount: amount,
  });

  if (contribError || !contribResult?.success) {
    console.error('Contribution processing failed for confirmed charge:', contribError);
    // Wallet is credited, contribution failed — acceptable state
    return;
  }

  // Update pending charge status
  await supabase.from('pending_card_charges').update({
    status: 'successful',
    verified_at: new Date().toISOString(),
    resolved_at: new Date().toISOString(),
  }).eq('id', charge.id as string);

  // Record in contribution_retries for audit
  await supabase.from('contribution_retries').insert({
    user_id: userId,
    group_id: groupId,
    cycle_id: cycleId,
    contribution_amount: amount,
    status: 'paid',
    payment_source: 'card_reconciled',
    transaction_reference: txRef,
    retry_count: 1,
    last_retry_at: new Date().toISOString(),
  });

  // Chat notification
  await supabase.from('chat_messages').insert({
    group_id: groupId,
    user_id: userId,
    message: `has contributed ₦${Number(amount).toLocaleString()} to the pool (via card)`,
    message_type: 'contribution_status',
  });
}
