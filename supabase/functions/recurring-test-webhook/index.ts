import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/crypto/mod.ts";

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

    // Verify webhook signature (using test webhook secret or shared one)
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

    // Log webhook to test table
    await supabase.from('recurring_webhook_logs_test').insert({
      event_type: event,
      tx_ref: txRef,
      flw_ref: flwRef,
      status,
      amount,
      payload,
    });

    // Only process if this is a recurring test transaction
    if (!txRef.startsWith('recurring-')) {
      console.log('[TEST WEBHOOK] Not a recurring test tx_ref, ignoring:', txRef);
      return new Response(JSON.stringify({ status: 'ignored', reason: 'Not a test transaction' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- TOKEN EXTRACTION (from first payment) ----
    if (txRef.startsWith('recurring-test-') && status === 'successful') {
      const card = data.card || {};
      if (card.token) {
        // Check if token already stored
        const { data: existing } = await supabase
          .from('user_payment_tokens_test')
          .select('id')
          .eq('card_token', card.token)
          .single();

        if (!existing) {
          // Store new test token
          // Use a placeholder user_id since this is test mode
          const userId = data.meta?.user_id || data.customer?.id || '00000000-0000-0000-0000-000000000001';
          await supabase.from('user_payment_tokens_test').insert({
            user_id: userId,
            card_token: card.token,
            first_6digits: card.first_6digits || card.first6 || null,
            last_4digits: card.last_4digits || card.last4 || null,
            expiry: card.expiry || null,
            card_type: card.type || card.brand || null,
          });
          console.log('[TEST WEBHOOK] Card token stored for test user');
        }
      }
    }

    // ---- LEDGER UPDATE (only on successful charge confirmation) ----
    if (txRef.startsWith('recurring-charge-') && status === 'successful') {
      const { data: ledgerEntry, error: ledgerErr } = await supabase
        .from('test_ledger_entries')
        .update({
          status: 'successful',
          updated_at: new Date().toISOString(),
        })
        .eq('tx_ref', txRef)
        .eq('status', 'pending')
        .select()
        .single();

      if (ledgerEntry) {
        console.log('[TEST WEBHOOK] Test ledger updated to successful for:', txRef);

        // Mark webhook as processed
        await supabase.from('recurring_webhook_logs_test')
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq('tx_ref', txRef);
      } else {
        console.warn('[TEST WEBHOOK] No pending ledger entry found for:', txRef, ledgerErr);
      }
    }

    // ---- FAILED CHARGE ----
    if (txRef.startsWith('recurring-charge-') && status === 'failed') {
      const { data: entry } = await supabase
        .from('test_ledger_entries')
        .select('*')
        .eq('tx_ref', txRef)
        .single();

      if (entry) {
        await supabase.from('test_ledger_entries')
          .update({
            status: 'failed',
            retry_count: (entry.retry_count || 0) + 1,
            failure_reason: data.processor_response || 'Charge failed',
            updated_at: new Date().toISOString(),
          })
          .eq('tx_ref', txRef);
        console.log('[TEST WEBHOOK] Test ledger marked failed for:', txRef);
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
