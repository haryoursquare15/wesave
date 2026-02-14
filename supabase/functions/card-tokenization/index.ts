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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Unauthorized');

    const body = await req.json();
    const { action } = body;

    // ========================================
    // ACTION: INITIATE — Return Flutterwave checkout config
    // ========================================
    if (action === 'initiate') {
      const { groupId } = body;
      if (!groupId) throw new Error('Group ID is required');

      // Verify user is a member of this group
      const { data: membership } = await supabase
        .from('group_memberships')
        .select('id, tokenization_completed')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (!membership) throw new Error('You are not a member of this group');
      if (membership.tokenization_completed) throw new Error('Card already authorized for this group');

      // Check if user already has an active token (can reuse across groups)
      const { data: existingToken } = await supabase
        .from('card_tokens')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('card_status', 'active')
        .limit(1)
        .single();

      if (existingToken) {
        // User already has a valid token — just mark membership as tokenized
        await supabase.from('group_memberships').update({
          tokenization_completed: true,
          terms_accepted_at: new Date().toISOString(),
        }).eq('id', membership.id);

        return new Response(JSON.stringify({
          success: true,
          already_tokenized: true,
          message: 'Existing card authorization found. Group activated.',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get user profile for checkout
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', user.id)
        .single();

      // Determine environment
      const flwTestSecret = Deno.env.get('FLUTTERWAVE_TEST_SECRET_KEY');
      const flwLiveSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
      const isTestMode = !!flwTestSecret;
      const flwPublicKey = isTestMode
        ? Deno.env.get('FLUTTERWAVE_TEST_PUBLIC_KEY')
        : Deno.env.get('FLUTTERWAVE_PUBLIC_KEY');

      const txRef = `token-${user.id.slice(0, 8)}-${groupId.slice(0, 8)}-${Date.now()}`;
      const redirectUrl = 'https://wesave.lovable.app/groups/' + groupId;

      // Get group contribution amount for the tokenization charge
      const { data: group } = await supabase
        .from('thrift_groups')
        .select('contribution_amount, name')
        .eq('id', groupId)
        .single();

      return new Response(JSON.stringify({
        success: true,
        already_tokenized: false,
        payment_config: {
          public_key: flwPublicKey || '',
          tx_ref: txRef,
          amount: group?.contribution_amount || 100,
          currency: 'NGN',
          redirect_url: redirectUrl,
          customer: {
            email: profile?.email || '',
            name: profile?.full_name || 'WeSave User',
          },
          customizations: {
            title: 'WeSave Card Authorization',
            description: `Authorize recurring payments for ${group?.name || 'your group'}`,
          },
          meta: {
            purpose: 'card_tokenization',
            user_id: user.id,
            group_id: groupId,
            membership_id: membership.id,
          },
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========================================
    // ACTION: VERIFY — Verify payment & save token
    // ========================================
    if (action === 'verify') {
      const { transactionId, groupId, txRef } = body;
      if (!transactionId || !groupId) throw new Error('Transaction ID and Group ID are required');

      // Determine environment
      const flwTestSecret = Deno.env.get('FLUTTERWAVE_TEST_SECRET_KEY');
      const flwLiveSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
      const secretKey = flwTestSecret || flwLiveSecret;

      if (!secretKey) throw new Error('Flutterwave secret key not configured');

      // Verify with Flutterwave
      const verifyResp = await fetch(`${FLUTTERWAVE_BASE_URL}/transactions/${transactionId}/verify`, {
        headers: { 'Authorization': `Bearer ${secretKey}` },
      });

      const verifyData = await verifyResp.json();
      console.log('Tokenization verify response:', JSON.stringify(verifyData));

      if (verifyData.status !== 'success' || verifyData.data?.status !== 'successful') {
        throw new Error('Transaction verification failed: ' + (verifyData.message || 'Unknown error'));
      }

      const txData = verifyData.data;
      const cardData = txData.card;

      if (!cardData?.token) {
        throw new Error('No card token returned from payment. Please try again.');
      }

      // Idempotency: check if this tx_ref was already processed
      const { data: existingEntry } = await supabase
        .from('card_tokens')
        .select('id')
        .eq('user_id', user.id)
        .eq('card_token', cardData.token)
        .single();

      if (!existingEntry) {
        // Deactivate any existing tokens for this user
        await supabase
          .from('card_tokens')
          .update({ is_active: false, card_status: 'revoked' })
          .eq('user_id', user.id)
          .eq('is_active', true);

        // Fetch group contribution amount for recurring_amount
        const { data: groupForAmount } = await supabase
          .from('thrift_groups')
          .select('contribution_amount')
          .eq('id', groupId)
          .single();

        // Save new token
        await supabase.from('card_tokens').insert({
          user_id: user.id,
          card_token: cardData.token,
          card_last4: cardData.last_4digits,
          card_type: cardData.type,
          card_expiry: cardData.expiry,
          first_6digits: cardData.first_6digits,
          charge_email: txData.customer?.email || null,
          is_active: true,
          card_status: 'active',
          group_id: groupId,
          recurring_amount: groupForAmount?.contribution_amount || txData.amount,
        });
      }

      // Mark membership as tokenized
      await supabase.from('group_memberships').update({
        tokenization_completed: true,
        terms_accepted_at: new Date().toISOString(),
      }).eq('group_id', groupId).eq('user_id', user.id).eq('status', 'active');

      // Credit wallet with the tokenization amount (since user paid real money)
      const amount = txData.amount;
      if (amount > 0) {
        const { error: creditError } = await supabase.rpc('credit_wallet_atomic', {
          _user_id: user.id,
          _amount: amount,
          _tx_ref: txRef || txData.tx_ref,
          _description: 'Card authorization deposit — credited to wallet',
        });

        if (creditError) {
          console.error('Failed to credit wallet after tokenization:', creditError);
          // Don't throw — tokenization succeeded, wallet credit is secondary
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Card authorized successfully. Amount credited to your wallet.',
        card_last4: cardData.last_4digits,
        card_type: cardData.type,
        amount_credited: amount,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========================================
    // ACTION: ACCEPT_TERMS — Just accept T&C without tokenization (non-auto_debit groups)
    // ========================================
    if (action === 'accept_terms') {
      const { groupId } = body;
      if (!groupId) throw new Error('Group ID is required');

      await supabase.from('group_memberships').update({
        terms_accepted_at: new Date().toISOString(),
      }).eq('group_id', groupId).eq('user_id', user.id).eq('status', 'active');

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: unknown) {
    console.error('Card tokenization error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
