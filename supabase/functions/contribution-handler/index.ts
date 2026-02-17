import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

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

          // Step 2: If insufficient funds, attempt card fallback with pending_card tracking
          if (errorMsg === 'Insufficient funds') {
            const cardResult = await handleCardFallback(supabase, user.id, groupId, amount);
            if (cardResult) {
              result = cardResult;
              break;
            }
            // No card token or charge failed completely
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

        // Internal payout: wallet-to-wallet transfer, no fees, no bank transfer
        const { data: payoutResult, error: rpcError } = await supabase.rpc('process_payout_atomic', { _admin_id: user.id, _group_id: groupId });

        if (rpcError) throw new Error('Failed to process payout');
        if (!payoutResult.success) throw new Error(payoutResult.error || 'Payout failed');

        // No platform fee on internal rotation payouts
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
      else if (msg.includes('card charged')) userMessage = error.message;
      else if (msg.includes('unauthorized')) userMessage = 'Authentication required';
      else if (msg.includes('pending_card')) userMessage = error.message;
      else userMessage = error.message;
    }
    return new Response(JSON.stringify({ success: false, error: userMessage }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// ========================================================================
// CARD FALLBACK HANDLER — Charges card, creates pending_card contribution
// ========================================================================
async function handleCardFallback(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  groupId: string,
  amount: number,
) {
  const FLUTTERWAVE_SECRET_KEY = Deno.env.get('FLUTTERWAVE_SECRET_KEY') || Deno.env.get('FLUTTERWAVE_TEST_SECRET_KEY');
  if (!FLUTTERWAVE_SECRET_KEY) return null;

  // Get active card token
  const { data: cardToken } = await supabase
    .from('card_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('card_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!cardToken) return null;

  // Get user profile for charge email
  const chargeEmail = cardToken.charge_email;
  let email = chargeEmail;
  if (!email) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();
    email = profile?.email;
  }
  if (!email) return null;

  // Get active cycle
  const { data: activeCycle } = await supabase
    .from('contribution_cycles')
    .select('id')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .single();

  if (!activeCycle) return null;

  const txRef = `card-contrib-${userId.slice(0, 8)}-${groupId.slice(0, 8)}-${Date.now()}`;

  try {
    // Charge the card
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
        email: email,
        tx_ref: txRef,
        redirect_url: 'https://app.wesave.ng/dashboard',
        narration: `WeSave contribution - Group ${groupId.slice(0, 8)}`,
        meta: {
          type: 'card_fallback_contribution',
          user_id: userId,
          group_id: groupId,
          cycle_id: activeCycle.id,
        },
      }),
    });

    const chargeData = await chargeResponse.json();
    console.log(`Card fallback charge for user ${userId}:`, JSON.stringify(chargeData));

    if (chargeData.status !== 'success') {
      // Charge initiation failed entirely
      await supabase.from('pending_card_charges').insert({
        user_id: userId,
        group_id: groupId,
        cycle_id: activeCycle.id,
        amount,
        tx_ref: txRef,
        status: 'failed',
        failure_reason: chargeData.message || 'Card charge initiation failed',
      });
      throw new Error('Insufficient wallet balance and card charge failed.');
    }

    const flwTransactionId = chargeData.data?.id?.toString() || null;
    const flwRef = chargeData.data?.flw_ref || null;
    const chargeStatus = chargeData.data?.status;

    // Create pending_card_charges record
    await supabase.from('pending_card_charges').insert({
      user_id: userId,
      group_id: groupId,
      cycle_id: activeCycle.id,
      amount,
      tx_ref: txRef,
      flw_transaction_id: flwTransactionId,
      flw_ref: flwRef,
      status: chargeStatus === 'successful' ? 'successful' : 'pending',
    });

    if (chargeStatus === 'successful') {
      // Immediately confirmed — credit wallet and process contribution
      return await confirmCardContribution(supabase, userId, groupId, activeCycle.id, amount, txRef, flwTransactionId);
    }

    // Transaction is pending — do NOT credit yet
    // Return pending_card status to frontend
    return {
      success: true,
      payment_source: 'card_pending',
      status: 'pending_card',
      tx_ref: txRef,
      message: 'Card charged — awaiting confirmation. Your contribution will be recorded once payment is verified.',
    };

  } catch (err) {
    if (err instanceof Error && (err.message.includes('Insufficient') || err.message.includes('pending_card'))) {
      throw err;
    }
    console.error('Card fallback error:', err);
    throw new Error('Insufficient wallet balance. Card fallback failed.');
  }
}

// ========================================================================
// CONFIRM CARD CONTRIBUTION — Called when charge is verified successful
// ========================================================================
async function confirmCardContribution(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  groupId: string,
  cycleId: string,
  amount: number,
  txRef: string,
  flwTransactionId: string | null,
) {
  // Credit wallet
  const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_atomic', {
    _user_id: userId,
    _amount: amount,
    _tx_ref: txRef,
    _description: 'Card fallback funding for contribution',
  });

  if (creditError || !creditResult?.success) {
    throw new Error('Card charged but wallet credit failed. Contact support.');
  }

  // Process contribution via wallet
  const { data: retryResult, error: retryError } = await supabase.rpc('process_contribution_ledger_atomic', {
    _user_id: userId,
    _group_id: groupId,
    _amount: amount,
  });

  if (retryError || !retryResult?.success) {
    throw new Error('Card charged and wallet funded, but contribution failed. Your wallet has been credited.');
  }

  // Update pending_card_charges
  await supabase.from('pending_card_charges')
    .update({ status: 'successful', verified_at: new Date().toISOString(), resolved_at: new Date().toISOString() })
    .eq('tx_ref', txRef);

  // Record in contribution_retries for audit
  await supabase.from('contribution_retries').insert({
    user_id: userId,
    group_id: groupId,
    cycle_id: cycleId,
    contribution_amount: amount,
    status: 'paid',
    payment_source: 'card_fallback',
    transaction_reference: txRef,
    retry_count: 1,
    last_retry_at: new Date().toISOString(),
  });

  await supabase.from('chat_messages').insert({
    group_id: groupId,
    user_id: userId,
    message: `has contributed ₦${Number(amount).toLocaleString()} to the pool (via card)`,
    message_type: 'contribution_status',
  });

  return {
    ...retryResult,
    payment_source: 'card_fallback',
    message: retryResult.all_contributed ? 'All members have contributed!' : 'Contribution recorded via card',
  };
}
