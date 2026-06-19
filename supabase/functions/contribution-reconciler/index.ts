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
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // SECURITY: reconcile actions are cron-only — require CRON_SECRET (manual_verify auths below)
    if (action === 'reconcile' || action === 'reconcile_splits') {
      const cronSecret = Deno.env.get('CRON_SECRET');
      const provided =
        req.headers.get('x-cron-secret') ||
        (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!cronSecret) {
        return new Response(JSON.stringify({ success: false, error: 'Server not configured' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (provided !== cronSecret) {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    // ================================================================
    // ACTION: RECONCILE — Process any remaining legacy pending card charges
    // Card charges are sunsetted; this only handles already-pending legacy records
    // ================================================================
    if (action === 'reconcile') {
      const flwSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY') || Deno.env.get('FLUTTERWAVE_TEST_SECRET_KEY');
      if (!flwSecret) {
        return new Response(JSON.stringify({ success: false, error: 'No Flutterwave key configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Only process legacy pending charges — no new ones will be created
      const { data: pendingCharges } = await supabase
        .from('pending_card_charges')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50);

      if (!pendingCharges || pendingCharges.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No legacy pending charges to reconcile', processed: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const results = [];
      for (const charge of pendingCharges) {
        const ageMs = Date.now() - new Date(charge.created_at).getTime();
        const isTimedOut = ageMs > 24 * 60 * 60 * 1000;

        // Mark old pending charges as cancelled (sunsetted)
        if (isTimedOut) {
          await supabase.from('pending_card_charges').update({
            status: 'failed',
            failure_reason: 'Card recurring charges sunsetted — please fund wallet instead',
            resolved_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
          }).eq('id', charge.id);

          results.push({ tx_ref: charge.tx_ref, status: 'cancelled_sunset' });
          continue;
        }

        // For recent ones, still try to verify if they have a transaction ID
        if (!charge.flw_transaction_id) {
          await supabase.from('pending_card_charges').update({
            status: 'failed',
            failure_reason: 'No transaction ID — card charges sunsetted',
            resolved_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
          }).eq('id', charge.id);
          results.push({ tx_ref: charge.tx_ref, status: 'cancelled_no_txn' });
          continue;
        }

        // Verify with Flutterwave for already-initiated transactions
        try {
          const verifyResp = await fetch(`${FLUTTERWAVE_BASE_URL}/transactions/${charge.flw_transaction_id}/verify`, {
            headers: { 'Authorization': `Bearer ${flwSecret}` },
          });
          const verifyData = await verifyResp.json();

          if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
            await processConfirmedCharge(supabase, charge);
            results.push({ tx_ref: charge.tx_ref, status: 'confirmed' });
          } else {
            await supabase.from('pending_card_charges').update({
              status: 'failed',
              failure_reason: `Legacy charge — ${verifyData.data?.status || 'unknown'}. Card charges sunsetted.`,
              resolved_at: new Date().toISOString(),
              last_checked_at: new Date().toISOString(),
            }).eq('id', charge.id);
            results.push({ tx_ref: charge.tx_ref, status: 'cancelled' });
          }
        } catch (err) {
          console.error(`Verify error for ${charge.tx_ref}:`, err);
          results.push({ tx_ref: charge.tx_ref, status: 'verify_error' });
        }
      }

      return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: RECONCILE_SPLITS — Auto-verify stuck split merchant settlements
    // ================================================================
    if (action === 'reconcile' || action === 'reconcile_splits') {
      const flwSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY') || Deno.env.get('FLUTTERWAVE_TEST_SECRET_KEY');
      if (!flwSecret && action === 'reconcile_splits') {
        return new Response(JSON.stringify({ success: false, error: 'No Flutterwave key configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (flwSecret) {
        // Find split settlements stuck in "processing" for > 5 minutes
        const { data: stuckSplits } = await supabase
          .from('split_requests')
          .select('id, settlement_flw_transfer_id, settlement_reference, creator_user_id, purpose, total_amount, merchant_account_name, updated_at')
          .eq('settlement_status', 'processing')
          .not('settlement_flw_transfer_id', 'is', null)
          .limit(20);

        const splitResults = [];
        for (const split of (stuckSplits || [])) {
          const ageMs = Date.now() - new Date(split.updated_at).getTime();
          if (ageMs < 5 * 60 * 1000) {
            splitResults.push({ id: split.id, status: 'too_recent' });
            continue;
          }

          try {
            // Verify transfer status via Flutterwave Transfers API
            const verifyRes = await fetch(`${FLUTTERWAVE_BASE_URL}/transfers/${split.settlement_flw_transfer_id}`, {
              headers: { 'Authorization': `Bearer ${flwSecret}` },
            });
            const verifyData = await verifyRes.json();
            const transferStatus = verifyData?.data?.status;

            console.log(`[SPLIT RECONCILE] ${split.id}: FLW status = ${transferStatus}`);

            if (transferStatus === 'SUCCESSFUL') {
              await supabase.from('split_requests').update({
                settlement_status: 'completed',
                settlement_completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq('id', split.id);

              await supabase.from('user_notifications').insert({
                user_id: split.creator_user_id,
                title: 'Merchant Payment Sent!',
                message: `₦${Number(split.total_amount).toLocaleString()} has been successfully transferred to ${split.merchant_account_name} for "${split.purpose}".`,
                notification_type: 'split_settlement_completed',
              });

              splitResults.push({ id: split.id, status: 'confirmed' });

            } else if (transferStatus === 'FAILED') {
              const reason = verifyData?.data?.complete_message || 'Transfer failed';
              await supabase.from('split_requests').update({
                settlement_status: 'failed',
                settlement_failure_reason: reason,
                updated_at: new Date().toISOString(),
              }).eq('id', split.id);

              await supabase.from('user_notifications').insert({
                user_id: split.creator_user_id,
                title: 'Merchant Settlement Failed',
                message: `Transfer to ${split.merchant_account_name} for "${split.purpose}" failed: ${reason}. Please contact support.`,
                notification_type: 'split_settlement_failed',
              });

              splitResults.push({ id: split.id, status: 'failed', reason });

            } else {
              // Still pending/new — skip
              splitResults.push({ id: split.id, status: 'still_pending', flw_status: transferStatus });
            }
          } catch (err) {
            console.error(`[SPLIT RECONCILE] Error verifying ${split.id}:`, err);
            splitResults.push({ id: split.id, status: 'verify_error' });
          }
        }

        if (action === 'reconcile_splits') {
          return new Response(JSON.stringify({ success: true, processed: splitResults.length, results: splitResults }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // If action === 'reconcile', fall through — splits were reconciled alongside card charges
        console.log('[RECONCILE] Split settlement results:', JSON.stringify(splitResults));
      }

      // If this was specifically reconcile_splits, we already returned above
      if (action === 'reconcile_splits') {
        return new Response(JSON.stringify({ success: true, processed: 0, message: 'No FLW key' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ================================================================
    // ACTION: MANUAL_VERIFY — Admin manually verifies a legacy pending charge
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

// Process a confirmed legacy card charge — credit wallet, process contribution
// deno-lint-ignore no-explicit-any
async function processConfirmedCharge(
  supabase: any,
  charge: Record<string, unknown>,
) {
  const userId = charge.user_id as string;
  const groupId = charge.group_id as string;
  const cycleId = charge.cycle_id as string;
  const amount = charge.amount as number;
  const txRef = charge.tx_ref as string;

  // Idempotency check
  const { data: existingContrib } = await supabase
    .from('cycle_contributions')
    .select('id')
    .eq('cycle_id', cycleId)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .single();

  if (existingContrib) {
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
    _description: 'Legacy card charge confirmed — contribution funding',
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
    return;
  }

  await supabase.from('pending_card_charges').update({
    status: 'successful',
    verified_at: new Date().toISOString(),
    resolved_at: new Date().toISOString(),
  }).eq('id', charge.id as string);

  await supabase.from('chat_messages').insert({
    group_id: groupId,
    user_id: userId,
    message: `has contributed ₦${Number(amount).toLocaleString()} to the pool (legacy card charge confirmed)`,
    message_type: 'contribution_status',
  });
}
