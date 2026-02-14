import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FLUTTERWAVE_TEST_BASE = "https://api.flutterwave.com/v3";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const flwTestSecret = Deno.env.get('FLUTTERWAVE_TEST_SECRET_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!flwTestSecret) {
      return new Response(JSON.stringify({ success: false, error: 'Test secret key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    // Skip auth for cron-triggered actions (runs via service role)
    if (action !== 'cron_auto_charge' && action !== 'verify_pending') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: isAdmin } = await supabase.rpc('is_any_admin', { _user_id: user.id });
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Admin access required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ========== HELPER: Get charge email ==========
    async function getChargeEmail(tokenData: any): Promise<string> {
      if (tokenData.charge_email) return tokenData.charge_email;
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', tokenData.user_id).single();
      return profile?.email || 'test@wesave.ng';
    }

    // ========== HELPER: Get next payment cycle ==========
    async function getNextCycle(userId: string): Promise<number> {
      const { data } = await supabase
        .from('payments_test')
        .select('payment_cycle')
        .eq('user_id', userId)
        .order('payment_cycle', { ascending: false })
        .limit(1)
        .single();
      return (data?.payment_cycle || 0) + 1;
    }

    // ========== HELPER: Verify a single transaction via Flutterwave API ==========
    async function verifyTransaction(flwTransactionId: string) {
      const resp = await fetch(`${FLUTTERWAVE_TEST_BASE}/transactions/${flwTransactionId}/verify`, {
        headers: { 'Authorization': `Bearer ${flwTestSecret}` },
      });
      return await resp.json();
    }

    // ========== HELPER: Confirm payment and create ledger entry ==========
    async function confirmPayment(paymentId: string, flwTransactionId: string | null, source: string) {
      // Fetch payment
      const { data: payment } = await supabase
        .from('payments_test')
        .select('*')
        .eq('id', paymentId)
        .single();
      
      if (!payment || payment.status === 'final_success') return { success: false, reason: 'Already confirmed or not found' };

      // Update payment to final_success
      await supabase.from('payments_test').update({
        status: 'final_success',
        flw_transaction_id: flwTransactionId || payment.flw_transaction_id,
        verified_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
      }).eq('id', paymentId);

      // Idempotency: check if ledger entry already exists
      const { data: existingLedger } = await supabase
        .from('ledger_confirmed_test')
        .select('id')
        .eq('payment_id', paymentId)
        .single();

      if (existingLedger) return { success: true, reason: 'Already in confirmed ledger' };

      // Create confirmed ledger entry
      await supabase.from('ledger_confirmed_test').insert({
        payment_id: paymentId,
        user_id: payment.user_id,
        group_id: payment.group_id,
        amount: payment.amount,
        tx_ref: payment.tx_ref,
        flw_transaction_id: flwTransactionId || payment.flw_transaction_id,
        payment_cycle: payment.payment_cycle,
      });

      // Log verification
      await supabase.from('recurring_webhook_logs_test').insert({
        event_type: `${source}.verified`,
        tx_ref: payment.tx_ref,
        flw_ref: payment.flw_ref || '',
        flw_transaction_id: flwTransactionId || payment.flw_transaction_id,
        status: 'final_success',
        amount: payment.amount,
        payload: { source, payment_id: paymentId },
        processed: true,
        processed_at: new Date().toISOString(),
        verification_source: source,
      });

      return { success: true };
    }

    // ================================================================
    // ACTION: CRON AUTO-CHARGE
    // ================================================================
    if (action === 'cron_auto_charge') {
      const { data: activeTokens } = await supabase
        .from('user_payment_tokens_test')
        .select('*')
        .eq('is_active', true);

      if (!activeTokens || activeTokens.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No active tokens', charged: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const results = [];
      for (const tokenData of activeTokens) {
        const { data: testGroup } = await supabase
          .from('test_recurring_groups').select('*').eq('status', 'active').limit(1).single();
        
        const amount = testGroup?.contribution_amount || 1000;
        const nextCycle = await getNextCycle(tokenData.user_id);
        const txRef = `cron-charge-${tokenData.user_id.slice(0, 8)}-${Date.now()}`;
        const chargeEmail = await getChargeEmail(tokenData);

        // Step 1: Create payment record as 'initiated'
        const { data: paymentRecord } = await supabase.from('payments_test').insert({
          user_id: tokenData.user_id,
          group_id: testGroup?.id || null,
          amount,
          tx_ref: txRef,
          status: 'initiated',
          payment_cycle: nextCycle,
          charge_type: 'cron',
        }).select().single();

        try {
          // Step 2: Call Flutterwave tokenized charge
          const chargeResp = await fetch(`${FLUTTERWAVE_TEST_BASE}/tokenized-charges`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${flwTestSecret}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              token: tokenData.card_token,
              currency: 'NGN',
              country: 'NG',
              amount,
              email: chargeEmail,
              tx_ref: txRef,
              narration: `WeSave Cron Recurring Test - Cycle ${nextCycle}`,
            }),
          });

          const chargeData = await chargeResp.json();
          console.log('Cron charge response:', JSON.stringify(chargeData));

          if (chargeData.status !== 'success') {
            // Step 3a: Mark as final_failed
            await supabase.from('payments_test').update({
              status: 'final_failed',
              failure_reason: chargeData.message || 'Charge initiation failed',
              processor_response: chargeData.data?.processor_response || null,
              resolved_at: new Date().toISOString(),
            }).eq('id', paymentRecord?.id);

            await supabase.from('recurring_webhook_logs_test').insert({
              event_type: 'cron.charge.failed',
              tx_ref: txRef,
              status: 'final_failed',
              amount,
              payload: chargeData,
              processed: true,
              processed_at: new Date().toISOString(),
              verification_source: 'direct',
            });
          } else {
            // Step 3b: Move to 'pending' - awaiting verification
            await supabase.from('payments_test').update({
              status: 'pending',
              flw_transaction_id: chargeData.data?.id?.toString() || null,
              flw_ref: chargeData.data?.flw_ref || null,
              processor_response: chargeData.data?.processor_response || null,
            }).eq('id', paymentRecord?.id);

            await supabase.from('recurring_webhook_logs_test').insert({
              event_type: 'cron.charge.initiated',
              tx_ref: txRef,
              flw_ref: chargeData.data?.flw_ref || '',
              flw_transaction_id: chargeData.data?.id?.toString() || null,
              status: 'pending',
              amount,
              payload: chargeData,
              processed: false,
              verification_source: 'awaiting',
            });
          }

          results.push({ user_id: tokenData.user_id, tx_ref: txRef, status: chargeData.status, cycle: nextCycle });
        } catch (err) {
          await supabase.from('payments_test').update({
            status: 'final_failed',
            failure_reason: err instanceof Error ? err.message : 'Network error',
            resolved_at: new Date().toISOString(),
          }).eq('id', paymentRecord?.id);
          results.push({ user_id: tokenData.user_id, tx_ref: txRef, status: 'error', error: err instanceof Error ? err.message : 'Unknown' });
        }
      }

      return new Response(JSON.stringify({ success: true, charged: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: INITIATE FIRST PAYMENT (token generation)
    // ================================================================
    if (action === 'initiate_payment') {
      const { email, amount, name } = body;
      const txRef = `recurring-test-${Date.now()}`;
      const flwPublicKey = Deno.env.get('FLUTTERWAVE_TEST_PUBLIC_KEY') || '';

      return new Response(JSON.stringify({
        success: true,
        payment_link_data: {
          public_key: flwPublicKey,
          tx_ref: txRef,
          amount: amount || 1000,
          currency: 'NGN',
          customer: { email: email || 'test@wesave.ng', name: name || 'Test User' },
          customizations: { title: 'WeSave Recurring Test', description: 'Card tokenization test' },
          meta: { test_mode: true, purpose: 'recurring_token_generation' },
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: RUN MANUAL RECURRING CHARGE
    // ================================================================
    if (action === 'run_recurring_charge') {
      const { token_id } = body;

      const { data: tokenData, error: tokenErr } = await supabase
        .from('user_payment_tokens_test')
        .select('*')
        .eq('id', token_id)
        .eq('is_active', true)
        .single();

      if (tokenErr || !tokenData) {
        return new Response(JSON.stringify({ success: false, error: 'No active test token found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: testGroup } = await supabase
        .from('test_recurring_groups').select('*').eq('status', 'active').limit(1).single();

      const amount = testGroup?.contribution_amount || 1000;
      const nextCycle = await getNextCycle(tokenData.user_id);
      const txRef = `recurring-charge-${tokenData.user_id.slice(0, 8)}-${Date.now()}`;
      const userEmail = await getChargeEmail(tokenData);

      // Create payment as 'initiated'
      const { data: paymentRecord } = await supabase.from('payments_test').insert({
        user_id: tokenData.user_id,
        group_id: testGroup?.id || null,
        amount,
        tx_ref: txRef,
        status: 'initiated',
        payment_cycle: nextCycle,
        charge_type: 'manual',
      }).select().single();

      try {
        const chargeResp = await fetch(`${FLUTTERWAVE_TEST_BASE}/tokenized-charges`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${flwTestSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: tokenData.card_token,
            currency: 'NGN',
            country: 'NG',
            amount,
            email: userEmail,
            tx_ref: txRef,
            narration: `WeSave Recurring Test - Cycle ${nextCycle}`,
          }),
        });

        const chargeData = await chargeResp.json();
        console.log('Manual charge response:', JSON.stringify(chargeData));

        if (chargeData.status !== 'success') {
          await supabase.from('payments_test').update({
            status: 'final_failed',
            failure_reason: chargeData.message || 'Charge initiation failed',
            processor_response: chargeData.data?.processor_response || null,
            resolved_at: new Date().toISOString(),
          }).eq('id', paymentRecord?.id);

          await supabase.from('recurring_webhook_logs_test').insert({
            event_type: 'manual.charge.failed',
            tx_ref: txRef,
            status: 'final_failed',
            amount,
            payload: chargeData,
            processed: true,
            processed_at: new Date().toISOString(),
            verification_source: 'direct',
          });
        } else {
          // Move to 'pending' - awaiting verification
          await supabase.from('payments_test').update({
            status: 'pending',
            flw_transaction_id: chargeData.data?.id?.toString() || null,
            flw_ref: chargeData.data?.flw_ref || null,
            processor_response: chargeData.data?.processor_response || null,
          }).eq('id', paymentRecord?.id);

          await supabase.from('recurring_webhook_logs_test').insert({
            event_type: 'manual.charge.initiated',
            tx_ref: txRef,
            flw_ref: chargeData.data?.flw_ref || '',
            flw_transaction_id: chargeData.data?.id?.toString() || null,
            status: 'pending',
            amount,
            payload: chargeData,
            processed: false,
            verification_source: 'awaiting',
          });
        }

        const finalStatus = chargeData.status === 'success'
          ? 'Charge initiated → pending verification.'
          : `Charge failed: ${chargeData.message}`;

        return new Response(JSON.stringify({
          success: true,
          charge_status: chargeData.status,
          tx_ref: txRef,
          cycle: nextCycle,
          message: finalStatus,
          raw_response: chargeData,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        await supabase.from('payments_test').update({
          status: 'final_failed',
          failure_reason: err instanceof Error ? err.message : 'Network error',
          resolved_at: new Date().toISOString(),
        }).eq('id', paymentRecord?.id);

        return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Charge error', tx_ref: txRef }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ================================================================
    // ACTION: VERIFY PENDING TRANSACTIONS (Verification Worker)
    // ================================================================
    if (action === 'verify_pending') {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

      // Find pending transactions older than 2 minutes
      const { data: pendingPayments } = await supabase
        .from('payments_test')
        .select('*')
        .in('status', ['initiated', 'pending'])
        .lt('created_at', twoMinutesAgo)
        .order('created_at', { ascending: true });

      if (!pendingPayments || pendingPayments.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No pending transactions to verify', verified: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const results = [];
      for (const payment of pendingPayments) {
        // Timeout check: > 24 hours or exceeded max retries
        const ageMs = Date.now() - new Date(payment.created_at).getTime();
        const isTimedOut = ageMs > 24 * 60 * 60 * 1000;
        const isMaxRetries = payment.retry_count >= payment.max_retries;

        if (isTimedOut || isMaxRetries) {
          await supabase.from('payments_test').update({
            status: 'unresolved',
            failure_reason: isTimedOut ? 'Timed out after 24 hours' : `Exceeded max retries (${payment.max_retries})`,
            resolved_at: new Date().toISOString(),
          }).eq('id', payment.id);

          await supabase.from('recurring_webhook_logs_test').insert({
            event_type: 'verify.timeout',
            tx_ref: payment.tx_ref,
            flw_transaction_id: payment.flw_transaction_id,
            status: 'unresolved',
            amount: payment.amount,
            payload: { reason: isTimedOut ? 'timeout_24h' : 'max_retries', retry_count: payment.retry_count },
            processed: true,
            processed_at: new Date().toISOString(),
            verification_source: 'api_verify',
          });

          results.push({ tx_ref: payment.tx_ref, status: 'unresolved', reason: isTimedOut ? 'timeout' : 'max_retries' });
          continue;
        }

        // If we don't have a flw_transaction_id, we can't verify via API
        if (!payment.flw_transaction_id) {
          await supabase.from('payments_test').update({
            retry_count: payment.retry_count + 1,
          }).eq('id', payment.id);
          results.push({ tx_ref: payment.tx_ref, status: 'no_flw_id', retry: payment.retry_count + 1 });
          continue;
        }

        // Call Flutterwave Verify API
        try {
          const verifyData = await verifyTransaction(payment.flw_transaction_id);
          console.log(`Verify ${payment.tx_ref}:`, JSON.stringify(verifyData));

          if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
            // FINAL SUCCESS - confirm and create ledger entry
            const confirmResult = await confirmPayment(payment.id, payment.flw_transaction_id, 'api_verify');
            results.push({ tx_ref: payment.tx_ref, status: 'final_success', confirm: confirmResult });
          } else if (verifyData.data?.status === 'failed' || verifyData.status === 'error') {
            // FINAL FAILED
            await supabase.from('payments_test').update({
              status: 'final_failed',
              failure_reason: verifyData.data?.processor_response || verifyData.message || 'Verification failed',
              processor_response: verifyData.data?.processor_response || null,
              verified_at: new Date().toISOString(),
              resolved_at: new Date().toISOString(),
            }).eq('id', payment.id);

            await supabase.from('recurring_webhook_logs_test').insert({
              event_type: 'verify.failed',
              tx_ref: payment.tx_ref,
              flw_transaction_id: payment.flw_transaction_id,
              status: 'final_failed',
              amount: payment.amount,
              payload: verifyData,
              processed: true,
              processed_at: new Date().toISOString(),
              verification_source: 'api_verify',
            });

            results.push({ tx_ref: payment.tx_ref, status: 'final_failed' });
          } else {
            // Still pending - increment retry
            await supabase.from('payments_test').update({
              retry_count: payment.retry_count + 1,
            }).eq('id', payment.id);

            results.push({ tx_ref: payment.tx_ref, status: 'still_pending', retry: payment.retry_count + 1 });
          }
        } catch (err) {
          // Verification API error - increment retry, don't change status
          await supabase.from('payments_test').update({
            retry_count: payment.retry_count + 1,
          }).eq('id', payment.id);
          results.push({ tx_ref: payment.tx_ref, status: 'verify_error', error: err instanceof Error ? err.message : 'Unknown' });
        }
      }

      return new Response(JSON.stringify({ success: true, verified: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: MANUAL RE-VERIFY (admin-triggered for specific payment)
    // ================================================================
    if (action === 'manual_verify') {
      const { payment_id } = body;

      const { data: payment } = await supabase
        .from('payments_test')
        .select('*')
        .eq('id', payment_id)
        .single();

      if (!payment) {
        return new Response(JSON.stringify({ success: false, error: 'Payment not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (payment.status === 'final_success') {
        return new Response(JSON.stringify({ success: true, message: 'Already confirmed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!payment.flw_transaction_id) {
        return new Response(JSON.stringify({ success: false, error: 'No Flutterwave transaction ID to verify' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const verifyData = await verifyTransaction(payment.flw_transaction_id);

      if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
        const confirmResult = await confirmPayment(payment.id, payment.flw_transaction_id, 'manual_verify');
        return new Response(JSON.stringify({ success: true, status: 'final_success', confirm: confirmResult, verify_data: verifyData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update with latest processor info
      await supabase.from('payments_test').update({
        processor_response: verifyData.data?.processor_response || null,
        retry_count: payment.retry_count + 1,
      }).eq('id', payment.id);

      return new Response(JSON.stringify({
        success: true,
        status: verifyData.data?.status || 'unknown',
        message: 'Transaction not yet successful',
        verify_data: verifyData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: SIMULATE FAILURE SCENARIOS
    // ================================================================
    if (action === 'simulate') {
      const { scenario } = body;

      if (scenario === 'webhook_not_received') {
        // Create a payment stuck in pending (simulates webhook never arriving)
        const txRef = `sim-no-webhook-${Date.now()}`;
        await supabase.from('payments_test').insert({
          user_id: '00000000-0000-0000-0000-000000000001',
          amount: 1000,
          tx_ref: txRef,
          status: 'pending',
          charge_type: 'simulation',
          flw_transaction_id: `sim-${Date.now()}`,
          payment_cycle: 99,
        });
        return new Response(JSON.stringify({ success: true, scenario: 'webhook_not_received', tx_ref: txRef, message: 'Simulated pending tx with no webhook. Verify worker will eventually resolve.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (scenario === 'pending_timeout') {
        // Create a payment that's been pending for > 24 hours
        const txRef = `sim-timeout-${Date.now()}`;
        const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        await supabase.from('payments_test').insert({
          user_id: '00000000-0000-0000-0000-000000000001',
          amount: 1000,
          tx_ref: txRef,
          status: 'pending',
          charge_type: 'simulation',
          flw_transaction_id: `sim-${Date.now()}`,
          payment_cycle: 99,
          created_at: oldDate,
        });
        return new Response(JSON.stringify({ success: true, scenario: 'pending_timeout', tx_ref: txRef, message: 'Simulated 24h+ pending tx. Will be marked unresolved on next verify run.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (scenario === 'failed_charge') {
        const txRef = `sim-failed-${Date.now()}`;
        await supabase.from('payments_test').insert({
          user_id: '00000000-0000-0000-0000-000000000001',
          amount: 1000,
          tx_ref: txRef,
          status: 'final_failed',
          charge_type: 'simulation',
          failure_reason: 'Simulated card decline',
          processor_response: 'Declined',
          payment_cycle: 99,
          resolved_at: new Date().toISOString(),
        });
        return new Response(JSON.stringify({ success: true, scenario: 'failed_charge', tx_ref: txRef, message: 'Simulated failed charge. No ledger entry created.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Unknown scenario. Use: webhook_not_received, pending_timeout, failed_charge' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: GET STATUS (dashboard data)
    // ================================================================
    if (action === 'get_status') {
      const [tokens, payments, confirmedLedger, webhookLogs, testGroups] = await Promise.all([
        supabase.from('user_payment_tokens_test').select('*').order('created_at', { ascending: false }),
        supabase.from('payments_test').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('ledger_confirmed_test').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('recurring_webhook_logs_test').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('test_recurring_groups').select('*'),
      ]);

      return new Response(JSON.stringify({
        success: true,
        tokens: tokens.data || [],
        payments: payments.data || [],
        confirmed_ledger: confirmedLedger.data || [],
        webhook_logs: webhookLogs.data || [],
        test_groups: testGroups.data || [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: VERIFY AND SAVE TOKEN (first payment callback)
    // ================================================================
    if (action === 'verify_and_save_token') {
      const { transaction_id, tx_ref } = body;

      if (!transaction_id) {
        return new Response(JSON.stringify({ success: false, error: 'transaction_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const verifyData = await verifyTransaction(transaction_id);
      console.log('Verify response:', JSON.stringify(verifyData));

      if (verifyData.status !== 'success' || verifyData.data?.status !== 'successful') {
        return new Response(JSON.stringify({ success: false, error: 'Transaction not successful', details: verifyData }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const txData = verifyData.data;
      const card = txData.card || {};

      await supabase.from('recurring_webhook_logs_test').insert({
        event_type: 'charge.completed.verified',
        tx_ref: txData.tx_ref || tx_ref,
        flw_ref: txData.flw_ref || '',
        flw_transaction_id: transaction_id.toString(),
        status: txData.status,
        amount: txData.amount,
        payload: verifyData,
        processed: true,
        processed_at: new Date().toISOString(),
        verification_source: 'initial_tokenization',
      });

      if (card.token) {
        const { data: existing } = await supabase
          .from('user_payment_tokens_test')
          .select('id')
          .eq('card_token', card.token)
          .single();

        if (!existing) {
          const authHeader2 = req.headers.get('Authorization');
          let userId = '00000000-0000-0000-0000-000000000001';
          if (authHeader2) {
            const t = authHeader2.replace('Bearer ', '');
            const { data: { user: u2 } } = await supabase.auth.getUser(t);
            if (u2) userId = u2.id;
          }

          await supabase.from('user_payment_tokens_test').insert({
            user_id: userId,
            card_token: card.token,
            first_6digits: card.first_6digits || null,
            last_4digits: card.last_4digits || null,
            expiry: card.expiry || null,
            card_type: card.type || null,
            charge_email: txData.customer?.email || null,
          });

          return new Response(JSON.stringify({ success: true, message: 'Token saved successfully', card_info: { last4: card.last_4digits, type: card.type, expiry: card.expiry } }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true, message: 'Token already exists' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'No card token in transaction response.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // ACTION: RESET TEST DATA
    // ================================================================
    if (action === 'reset_test_data') {
      // Delete in order due to FK constraints
      await supabase.from('ledger_confirmed_test').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('payments_test').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('recurring_webhook_logs_test').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('user_payment_tokens_test').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      // Keep old test_ledger_entries for historical reference but clean too
      await supabase.from('test_ledger_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      return new Response(JSON.stringify({ success: true, message: 'All test data reset' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Recurring test charge error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
