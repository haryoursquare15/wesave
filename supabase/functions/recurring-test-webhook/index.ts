import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, verif-hash',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log('[TEST WEBHOOK] Received payload:', JSON.stringify(payload));

    // Verify webhook signature
    const verifHash = req.headers.get('verif-hash');
    const webhookSecret = Deno.env.get('FLUTTERWAVE_WEBHOOK_SECRET');
    if (webhookSecret && verifHash !== webhookSecret) {
      console.warn('[TEST WEBHOOK] Signature mismatch - rejecting');
      return new Response(JSON.stringify({ status: 'rejected', reason: 'Invalid signature' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = payload.event || payload.data?.event || 'unknown';
    const data = payload.data || payload;
    const txRef = data.tx_ref || data.txRef || '';
    const flwRef = data.flw_ref || '';
    const status = data.status || '';
    const amount = data.amount || 0;
    const flwTransactionId = data.id?.toString() || '';

    // Log webhook
    await supabase.from('recurring_webhook_logs_test').insert({
      event_type: event,
      tx_ref: txRef,
      flw_ref: flwRef,
      flw_transaction_id: flwTransactionId,
      status,
      amount,
      payload,
      verification_source: 'webhook',
    });

    // Only process recurring test transactions
    if (!txRef.startsWith('recurring-') && !txRef.startsWith('cron-charge-')) {
      console.log('[TEST WEBHOOK] Not a test tx_ref, ignoring:', txRef);
      return new Response(JSON.stringify({ status: 'ignored', reason: 'Not a test transaction' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- TOKEN EXTRACTION (from first payment) ----
    if (txRef.startsWith('recurring-test-') && status === 'successful') {
      const card = data.card || {};
      if (card.token) {
        const { data: existing } = await supabase
          .from('user_payment_tokens_test')
          .select('id')
          .eq('card_token', card.token)
          .single();

        if (!existing) {
          const userId = data.meta?.user_id || data.customer?.id || '00000000-0000-0000-0000-000000000001';
          await supabase.from('user_payment_tokens_test').insert({
            user_id: userId,
            card_token: card.token,
            first_6digits: card.first_6digits || card.first6 || null,
            last_4digits: card.last_4digits || card.last4 || null,
            expiry: card.expiry || null,
            card_type: card.type || card.brand || null,
            charge_email: data.customer?.email || null,
          });
          console.log('[TEST WEBHOOK] Card token stored');
        }
      }
    }

    // ---- RECONCILIATION: Update payments_test on successful webhook ----
    if (status === 'successful' && (txRef.startsWith('recurring-charge-') || txRef.startsWith('cron-charge-'))) {
      // Find the payment record
      const { data: payment } = await supabase
        .from('payments_test')
        .select('*')
        .eq('tx_ref', txRef)
        .single();

      if (payment && payment.status !== 'final_success') {
        // Update to final_success
        await supabase.from('payments_test').update({
          status: 'final_success',
          flw_transaction_id: flwTransactionId || payment.flw_transaction_id,
          verified_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
        }).eq('id', payment.id);

        // Idempotency: check if ledger entry already exists
        const { data: existingLedger } = await supabase
          .from('ledger_confirmed_test')
          .select('id')
          .eq('payment_id', payment.id)
          .single();

        if (!existingLedger) {
          // Create confirmed ledger entry
          await supabase.from('ledger_confirmed_test').insert({
            payment_id: payment.id,
            user_id: payment.user_id,
            group_id: payment.group_id,
            amount: payment.amount,
            tx_ref: payment.tx_ref,
            flw_transaction_id: flwTransactionId || payment.flw_transaction_id,
            payment_cycle: payment.payment_cycle,
          });
          console.log('[TEST WEBHOOK] Confirmed ledger entry created for:', txRef);
        }

        // Mark webhook as processed
        await supabase.from('recurring_webhook_logs_test')
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq('tx_ref', txRef)
          .eq('verification_source', 'webhook');
      } else if (!payment) {
        console.warn('[TEST WEBHOOK] No payment record found for:', txRef);
      } else {
        console.log('[TEST WEBHOOK] Payment already confirmed for:', txRef);
      }
    }

    // ---- FAILED WEBHOOK ----
    if (status === 'failed' && (txRef.startsWith('recurring-charge-') || txRef.startsWith('cron-charge-'))) {
      const { data: payment } = await supabase
        .from('payments_test')
        .select('*')
        .eq('tx_ref', txRef)
        .single();

      if (payment && !['final_success', 'final_failed'].includes(payment.status)) {
        await supabase.from('payments_test').update({
          status: 'final_failed',
          failure_reason: data.processor_response || 'Charge failed (webhook)',
          processor_response: data.processor_response || null,
          resolved_at: new Date().toISOString(),
        }).eq('id', payment.id);
        console.log('[TEST WEBHOOK] Payment marked failed for:', txRef);
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[TEST WEBHOOK] Error:', error);
    return new Response(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
