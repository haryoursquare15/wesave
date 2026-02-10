import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";
const PLATFORM_BANK_CODE = "044";
const PLATFORM_ACCOUNT_NUMBER = Deno.env.get('PLATFORM_BANK_ACCOUNT') || "";

serve(async (req) => {
  const corsHeadersLocal = corsHeaders;
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersLocal });
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

        // Step 1: Try wallet deduction
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
          
          // Step 2: If insufficient funds, attempt card fallback
          if (errorMsg === 'Insufficient funds') {
            const FLUTTERWAVE_SECRET_KEY = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
            
            if (FLUTTERWAVE_SECRET_KEY) {
              // Check for active card token
              const { data: cardToken } = await supabase
                .from('card_tokens')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

              if (cardToken) {
                // Get user profile for charge
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('email, full_name')
                  .eq('id', user.id)
                  .single();

                if (profile?.email) {
                  // Get active cycle for retry tracking
                  const { data: activeCycle } = await supabase
                    .from('contribution_cycles')
                    .select('id')
                    .eq('group_id', groupId)
                    .eq('status', 'active')
                    .single();

                  const txRef = `card-contrib-${user.id.slice(0, 8)}-${groupId.slice(0, 8)}-${Date.now()}`;

                  try {
                    const chargeResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/tokenized-charges`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        token: cardToken.card_token,
                        currency: 'NGN',
                        country: 'NG',
                        amount: amount,
                        email: profile.email,
                        full_name: profile.full_name || 'WeSave User',
                        tx_ref: txRef,
                        narration: `WeSave contribution - Group ${groupId.slice(0, 8)}`,
                        meta: {
                          type: 'card_fallback_contribution',
                          user_id: user.id,
                          group_id: groupId,
                          cycle_id: activeCycle?.id,
                        },
                      }),
                    });

                    const chargeData = await chargeResponse.json();
                    console.log(`Card fallback charge for user ${user.id}:`, JSON.stringify(chargeData));

                    if (chargeData.status === 'success' && chargeData.data?.status === 'successful') {
                      // Credit wallet
                      const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_atomic', {
                        _user_id: user.id,
                        _amount: amount,
                        _tx_ref: txRef,
                        _description: 'Card fallback funding for contribution',
                      });

                      if (creditError || !creditResult?.success) {
                        throw new Error('Card charged but wallet credit failed. Contact support.');
                      }

                      // Re-attempt contribution
                      const { data: retryResult, error: retryError } = await supabase.rpc('process_contribution_ledger_atomic', {
                        _user_id: user.id,
                        _group_id: groupId,
                        _amount: amount,
                      });

                      if (retryError || !retryResult?.success) {
                        throw new Error('Card charged and wallet funded, but contribution failed. Your wallet has been credited.');
                      }

                      // Record in contribution_retries
                      if (activeCycle) {
                        await supabase.from('contribution_retries').insert({
                          user_id: user.id,
                          group_id: groupId,
                          cycle_id: activeCycle.id,
                          contribution_amount: amount,
                          status: 'paid',
                          payment_source: 'card_fallback',
                          transaction_reference: txRef,
                          retry_count: 1,
                          last_retry_at: new Date().toISOString(),
                        });
                      }

                      await supabase.from('chat_messages').insert({
                        group_id: groupId,
                        user_id: user.id,
                        message: `has contributed ₦${Number(amount).toLocaleString()} to the pool (via card fallback)`,
                        message_type: 'contribution_status',
                      });

                      result = {
                        ...retryResult,
                        payment_source: 'card_fallback',
                        message: retryResult.all_contributed ? 'All members have contributed!' : 'Contribution recorded via card fallback',
                      };
                      break;
                    } else {
                      // Card charge failed
                      if (activeCycle) {
                        const nextRetry = new Date(Date.now() + 24 * 60 * 60 * 1000);
                        await supabase.from('contribution_retries').insert({
                          user_id: user.id,
                          group_id: groupId,
                          cycle_id: activeCycle.id,
                          contribution_amount: amount,
                          status: 'failed',
                          payment_source: 'card_fallback',
                          failure_reason: chargeData.message || 'Card charge failed',
                          transaction_reference: txRef,
                          retry_count: 1,
                          last_retry_at: new Date().toISOString(),
                          next_retry_at: nextRetry.toISOString(),
                        });
                      }
                      throw new Error('Insufficient wallet balance and card charge failed. Will retry automatically.');
                    }
                  } catch (chargeErr) {
                    if (chargeErr instanceof Error && chargeErr.message.includes('Card charged')) {
                      throw chargeErr;
                    }
                    if (chargeErr instanceof Error && chargeErr.message.includes('Insufficient wallet')) {
                      throw chargeErr;
                    }
                    console.error('Card fallback error:', chargeErr);
                    throw new Error('Insufficient wallet balance. Card fallback failed.');
                  }
                }
              }
            }

            // No card token or no Flutterwave key
            throw new Error('Insufficient wallet balance. Please fund your wallet or add a card.');
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
              body: JSON.stringify({ account_bank: PLATFORM_BANK_CODE, account_number: PLATFORM_ACCOUNT_NUMBER, amount: payoutResult.platform_fee, currency: 'NGN', narration: `WeSave fee - ${groupId}`, reference: transferRef, debit_currency: 'NGN' }),
            });
          }
        }

        result = payoutResult;
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeadersLocal, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Contribution error:', error);
    let userMessage = 'An error occurred';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('no active')) userMessage = 'No active contribution cycle.';
      else if (msg.includes('already contributed')) userMessage = 'You have already contributed.';
      else if (msg.includes('insufficient')) userMessage = error.message; // Pass through the detailed message
      else if (msg.includes('card charged')) userMessage = error.message;
      else if (msg.includes('unauthorized')) userMessage = 'Authentication required';
      else userMessage = error.message;
    }
    return new Response(JSON.stringify({ success: false, error: userMessage }), { status: 400, headers: { ...corsHeadersLocal, 'Content-Type': 'application/json' } });
  }
});