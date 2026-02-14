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

    // Skip auth for cron-triggered auto-charge (only touches test tables)
    if (action !== 'cron_auto_charge') {
      // Auth check - admin only
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

    // ---- ACTION: CRON AUTO-CHARGE (no auth needed, runs via service role cron) ----
    if (action === 'cron_auto_charge') {
      // Fetch all active tokens and charge each one
      const { data: activeTokens } = await supabase
        .from('user_payment_tokens_test')
        .select('*')
        .eq('is_active', true);

      if (!activeTokens || activeTokens.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No active tokens to charge', charged: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const results = [];
      for (const tokenData of activeTokens) {
        const { data: testGroup } = await supabase
          .from('test_recurring_groups')
          .select('*')
          .eq('status', 'active')
          .limit(1)
          .single();

        const amount = testGroup?.contribution_amount || 1000;
        const txRef = `cron-charge-${tokenData.user_id.slice(0, 8)}-${Date.now()}`;

        // Use stored charge_email first, fall back to profile email
        let chargeEmail = tokenData.charge_email;
        if (!chargeEmail) {
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', tokenData.user_id)
            .single();
          chargeEmail = userProfile?.email || 'test@wesave.ng';
        }

        const { data: lastLedger } = await supabase
          .from('test_ledger_entries')
          .select('payment_cycle')
          .eq('user_id', tokenData.user_id)
          .order('payment_cycle', { ascending: false })
          .limit(1)
          .single();

        const nextCycle = (lastLedger?.payment_cycle || 0) + 1;

        await supabase.from('test_ledger_entries').insert({
          user_id: tokenData.user_id,
          group_id: testGroup?.id || null,
          amount,
          tx_ref: txRef,
          status: 'pending',
          payment_cycle: nextCycle,
        });

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
              email: chargeEmail,
              tx_ref: txRef,
              narration: `WeSave Cron Recurring Test - Cycle ${nextCycle}`,
              redirect_url: `${supabaseUrl}/functions/v1/recurring-test-webhook`,
            }),
          });

          const chargeData = await chargeResp.json();
          console.log('Cron recurring charge response:', JSON.stringify(chargeData));

          if (chargeData.status !== 'success') {
            await supabase.from('test_ledger_entries')
              .update({ status: 'failed', failure_reason: chargeData.message || 'Charge failed', updated_at: new Date().toISOString() })
              .eq('tx_ref', txRef);
          } else {
            // Auto-verify since sandbox doesn't send webhooks
            const chargeId = chargeData.data?.id;
            if (chargeId) {
              // Brief delay to allow Flutterwave to process
              await new Promise(r => setTimeout(r, 3000));
              try {
                const verifyResp = await fetch(`${FLUTTERWAVE_TEST_BASE}/transactions/${chargeId}/verify`, {
                  headers: { 'Authorization': `Bearer ${flwTestSecret}` },
                });
                const verifyData = await verifyResp.json();
                console.log('Cron auto-verify response:', JSON.stringify(verifyData));
                if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
                  await supabase.from('test_ledger_entries')
                    .update({ status: 'successful', updated_at: new Date().toISOString() })
                    .eq('tx_ref', txRef)
                    .eq('status', 'pending');
                  console.log('Cron auto-verified successful for:', txRef);
                }
              } catch (verifyErr) {
                console.warn('Cron auto-verify failed:', verifyErr);
              }
            }
          }

          results.push({ user_id: tokenData.user_id, tx_ref: txRef, status: chargeData.status, cycle: nextCycle });
        } catch (err) {
          await supabase.from('test_ledger_entries')
            .update({ status: 'failed', failure_reason: err instanceof Error ? err.message : 'Network error', updated_at: new Date().toISOString() })
            .eq('tx_ref', txRef);
          results.push({ user_id: tokenData.user_id, tx_ref: txRef, status: 'error', error: err instanceof Error ? err.message : 'Unknown' });
        }
      }

      return new Response(JSON.stringify({ success: true, charged: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- ACTION: INITIATE FIRST PAYMENT (for token generation) ----
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

    // ---- ACTION: RUN RECURRING CHARGE ----
    if (action === 'run_recurring_charge') {
      const { token_id } = body;

      // Fetch token
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

      // Fetch test group
      const { data: testGroup } = await supabase
        .from('test_recurring_groups')
        .select('*')
        .eq('status', 'active')
        .limit(1)
        .single();

      const amount = testGroup?.contribution_amount || 1000;
      const txRef = `recurring-charge-${tokenData.user_id.slice(0, 8)}-${Date.now()}`;

      // Use stored charge_email first, fall back to profile email
      let userEmail = tokenData.charge_email;
      if (!userEmail) {
        const { data: chargeProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', tokenData.user_id)
          .single();
        userEmail = chargeProfile?.email || 'test@wesave.ng';
      }

      // Get last cycle number
      const { data: lastLedger } = await supabase
        .from('test_ledger_entries')
        .select('payment_cycle')
        .eq('user_id', tokenData.user_id)
        .order('payment_cycle', { ascending: false })
        .limit(1)
        .single();

      const nextCycle = (lastLedger?.payment_cycle || 0) + 1;

      // Create pending ledger entry FIRST (webhook will confirm)
      await supabase.from('test_ledger_entries').insert({
        user_id: tokenData.user_id,
        group_id: testGroup?.id || null,
        amount,
        tx_ref: txRef,
        status: 'pending',
        payment_cycle: nextCycle,
      });

      // Attempt tokenized charge via Flutterwave TEST API
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
            redirect_url: `${supabaseUrl}/functions/v1/recurring-test-webhook`,
          }),
        });

        const chargeData = await chargeResp.json();
        console.log('Recurring test charge response:', JSON.stringify(chargeData));

        if (chargeData.status !== 'success') {
          await supabase.from('test_ledger_entries')
            .update({ status: 'failed', failure_reason: chargeData.message || 'Charge initiation failed', updated_at: new Date().toISOString() })
            .eq('tx_ref', txRef);
        } else {
          // Auto-verify since sandbox doesn't send webhooks
          const chargeId = chargeData.data?.id;
          if (chargeId) {
            await new Promise(r => setTimeout(r, 3000));
            try {
              const verifyResp = await fetch(`${FLUTTERWAVE_TEST_BASE}/transactions/${chargeId}/verify`, {
                headers: { 'Authorization': `Bearer ${flwTestSecret}` },
              });
              const verifyData = await verifyResp.json();
              console.log('Manual auto-verify response:', JSON.stringify(verifyData));
              if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
                await supabase.from('test_ledger_entries')
                  .update({ status: 'successful', updated_at: new Date().toISOString() })
                  .eq('tx_ref', txRef)
                  .eq('status', 'pending');
              }
            } catch (verifyErr) {
              console.warn('Manual auto-verify failed:', verifyErr);
            }
          }
        }

        const finalStatus = chargeData.status === 'success' ? 'Charge initiated and auto-verified.' : `Charge failed: ${chargeData.message}`;

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
        await supabase.from('test_ledger_entries')
          .update({ status: 'failed', failure_reason: err instanceof Error ? err.message : 'Network error', updated_at: new Date().toISOString() })
          .eq('tx_ref', txRef);

        return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Charge error', tx_ref: txRef }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ---- ACTION: GET STATUS ----
    if (action === 'get_status') {
      const [tokens, ledger, webhookLogs, testGroups] = await Promise.all([
        supabase.from('user_payment_tokens_test').select('*').order('created_at', { ascending: false }),
        supabase.from('test_ledger_entries').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('recurring_webhook_logs_test').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('test_recurring_groups').select('*'),
      ]);

      return new Response(JSON.stringify({
        success: true,
        tokens: tokens.data || [],
        ledger: ledger.data || [],
        webhook_logs: webhookLogs.data || [],
        test_groups: testGroups.data || [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- ACTION: RESET TEST DATA ----
    if (action === 'reset_test_data') {
      await Promise.all([
        supabase.from('test_ledger_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('recurring_webhook_logs_test').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('user_payment_tokens_test').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      ]);

      return new Response(JSON.stringify({ success: true, message: 'All test data reset' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- ACTION: VERIFY TRANSACTION AND SAVE TOKEN ----
    if (action === 'verify_and_save_token') {
      const { transaction_id, tx_ref } = body;

      if (!transaction_id) {
        return new Response(JSON.stringify({ success: false, error: 'transaction_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify transaction with Flutterwave
      const verifyResp = await fetch(`${FLUTTERWAVE_TEST_BASE}/transactions/${transaction_id}/verify`, {
        headers: { 'Authorization': `Bearer ${flwTestSecret}` },
      });
      const verifyData = await verifyResp.json();
      console.log('Verify response:', JSON.stringify(verifyData));

      if (verifyData.status !== 'success' || verifyData.data?.status !== 'successful') {
        return new Response(JSON.stringify({ success: false, error: 'Transaction not successful', details: verifyData }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const txData = verifyData.data;
      const card = txData.card || {};

      // Log webhook equivalent
      await supabase.from('recurring_webhook_logs_test').insert({
        event_type: 'charge.completed.verified',
        tx_ref: txData.tx_ref || tx_ref,
        flw_ref: txData.flw_ref || '',
        status: txData.status,
        amount: txData.amount,
        payload: verifyData,
        processed: true,
        processed_at: new Date().toISOString(),
      });

      if (card.token) {
        // Check if token already exists
        const { data: existing } = await supabase
          .from('user_payment_tokens_test')
          .select('id')
          .eq('card_token', card.token)
          .single();

        if (!existing) {
          // Use the authenticated user's ID
          const authHeader2 = req.headers.get('Authorization');
          let userId = '00000000-0000-0000-0000-000000000001';
          if (authHeader2) {
            const t = authHeader2.replace('Bearer ', '');
            const { data: { user: u2 } } = await supabase.auth.getUser(t);
            if (u2) userId = u2.id;
          }

          const customerEmail = txData.customer?.email || null;

          await supabase.from('user_payment_tokens_test').insert({
            user_id: userId,
            card_token: card.token,
            first_6digits: card.first_6digits || null,
            last_4digits: card.last_4digits || null,
            expiry: card.expiry || null,
            card_type: card.type || null,
            charge_email: customerEmail,
          });

          return new Response(JSON.stringify({ success: true, message: 'Token saved successfully', card_info: { last4: card.last_4digits, type: card.type, expiry: card.expiry } }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true, message: 'Token already exists' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'No card token in transaction response. Card tokenization may not be supported for this test card.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
