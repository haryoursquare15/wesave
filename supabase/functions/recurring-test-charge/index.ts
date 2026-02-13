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

    const body = await req.json();
    const { action } = body;

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
            email: 'test@wesave.ng',
            tx_ref: txRef,
            narration: `WeSave Recurring Test - Cycle ${nextCycle}`,
          }),
        });

        const chargeData = await chargeResp.json();
        console.log('Recurring test charge response:', JSON.stringify(chargeData));

        // Do NOT auto-credit. Wait for webhook. Just log result.
        if (chargeData.status !== 'success') {
          // Update ledger as failed immediately for non-success API responses
          await supabase.from('test_ledger_entries')
            .update({ status: 'failed', failure_reason: chargeData.message || 'Charge initiation failed', updated_at: new Date().toISOString() })
            .eq('tx_ref', txRef);
        }

        return new Response(JSON.stringify({
          success: true,
          charge_status: chargeData.status,
          tx_ref: txRef,
          cycle: nextCycle,
          message: chargeData.status === 'success'
            ? 'Charge initiated. Awaiting webhook confirmation before crediting ledger.'
            : `Charge failed: ${chargeData.message}`,
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
