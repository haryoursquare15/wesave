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

    // SERVICE-LEVEL: recover_token uses service_role key auth (no user session needed)
    if (action === 'recover_token') {
      // Service-level action - verify via FLUTTERWAVE_WEBHOOK_SECRET as admin token
      const { adminToken, transactionId, targetUserId } = body;
      const webhookSecret = Deno.env.get('FLUTTERWAVE_WEBHOOK_SECRET');
      if (!adminToken || adminToken !== webhookSecret) {
        throw new Error('Unauthorized: admin token required');
      }
      if (!transactionId || !targetUserId) throw new Error('Transaction ID and target user ID are required');
      if (!transactionId || !targetUserId) throw new Error('Transaction ID and target user ID are required');

      const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
      if (!secretKey) throw new Error('Flutterwave secret key not configured');

      const verifyResp = await fetch(`${FLUTTERWAVE_BASE_URL}/transactions/${transactionId}/verify`, {
        headers: { 'Authorization': `Bearer ${secretKey}` },
      });
      const verifyData = await verifyResp.json();
      console.log('Recover token verify response:', JSON.stringify(verifyData));

      if (verifyData.status !== 'success' || verifyData.data?.status !== 'successful') {
        throw new Error('Transaction verification failed');
      }

      const cardData = verifyData.data.card;
      if (!cardData?.token) {
        throw new Error('No card token in transaction');
      }

      // Update placeholder token
      const { error: updateError } = await supabase.from('card_tokens')
        .update({ card_token: cardData.token })
        .eq('user_id', targetUserId)
        .eq('card_token', 'placeholder_needs_verify')
        .eq('is_active', true);

      if (updateError) throw new Error('Failed to update token: ' + updateError.message);

      return new Response(JSON.stringify({
        success: true,
        card_token_updated: true,
        card_last4: cardData.last_4digits,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Unauthorized');

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

      // Use live keys for production card authorization
      const flwPublicKey = Deno.env.get('FLUTTERWAVE_PUBLIC_KEY');

      const txRef = `token-${user.id.slice(0, 8)}-${groupId.slice(0, 8)}-${Date.now()}`;
      // Use origin from request headers for redirect, fallback to published URL
      const origin = req.headers.get('origin') || 'https://wesave.lovable.app';
      const redirectUrl = `${origin}/groups/${groupId}`;

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
            name: profile?.full_name || 'Vestara User',
          },
          customizations: {
            title: 'Vestara Card Authorization',
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

      // Use live secret key for verification
      const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');

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

    // ========================================
    // ACTION: GET_CARD — Return user's active card info
    // ========================================
    if (action === 'get_card') {
      // First try to get a fully active card
      const { data: card } = await supabase
        .from('card_tokens')
        .select('id, card_last4, card_type, first_6digits, card_expiry, card_status, card_token, last_tokenized_at, created_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('card_status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Check if there's a placeholder token that needs recovery
      const needsRecovery = card?.card_token === 'placeholder_needs_verify';

      // Strip card_token from response for security
      const safeCard = card ? {
        id: card.id,
        card_last4: card.card_last4,
        card_type: card.card_type,
        first_6digits: card.first_6digits,
        card_expiry: card.card_expiry,
        card_status: card.card_status,
        last_tokenized_at: card.last_tokenized_at,
        created_at: card.created_at,
        needs_recovery: needsRecovery,
      } : null;

      return new Response(JSON.stringify({
        success: true,
        card: safeCard,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========================================
    // ACTION: RECOVER_TOKEN_USER — User-initiated token recovery
    // ========================================
    if (action === 'recover_token_user') {
      const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
      if (!secretKey) throw new Error('Payment service not configured');

      // Find the placeholder token for this user
      const { data: placeholderToken } = await supabase
        .from('card_tokens')
        .select('id, created_at')
        .eq('user_id', user.id)
        .eq('card_token', 'placeholder_needs_verify')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!placeholderToken) {
        throw new Error('No card token pending recovery');
      }

      // Find the Flutterwave transaction ID from webhook_events
      // The user_id is encoded in the tx_ref as retoken-{userId8chars}-{timestamp}
      const userIdPrefix = user.id.slice(0, 8);
      
      const { data: webhookEvents } = await supabase
        .from('webhook_events')
        .select('payload')
        .eq('event_type', 'charge.completed')
        .order('created_at', { ascending: false })
        .limit(20);

      let flwTransactionId: string | null = null;

      if (webhookEvents) {
        for (const evt of webhookEvents) {
          const payload = evt.payload as any;
          const txRef = payload?.data?.tx_ref || payload?.txRef || '';
          if (txRef.startsWith(`retoken-${userIdPrefix}`) || txRef.startsWith(`token-${userIdPrefix}`)) {
            flwTransactionId = String(payload?.data?.id || payload?.id || '');
            if (flwTransactionId) break;
          }
        }
      }

      // Fallback: check ledger_entries for the tx_ref and try to extract from reference
      if (!flwTransactionId) {
        const { data: ledgerEntries } = await supabase
          .from('ledger_entries')
          .select('reference_id')
          .eq('user_id', user.id)
          .in('reference_type', ['card_reauthorization', 'card_authorization'])
          .order('created_at', { ascending: false })
          .limit(5);

        if (ledgerEntries?.length) {
          // Use the tx_ref from ledger to search webhook_events more precisely
          for (const entry of ledgerEntries) {
            if (!entry.reference_id) continue;
            const { data: matchedEvents } = await supabase
              .from('webhook_events')
              .select('payload')
              .eq('event_type', 'charge.completed')
              .order('created_at', { ascending: false })
              .limit(50);

            if (matchedEvents) {
              for (const evt of matchedEvents) {
                const payload = evt.payload as any;
                const txRef = payload?.data?.tx_ref || '';
                if (txRef === entry.reference_id) {
                  flwTransactionId = String(payload?.data?.id || '');
                  break;
                }
              }
            }
            if (flwTransactionId) break;
          }
        }
      }

      if (!flwTransactionId) {
        throw new Error('Could not find a recent payment transaction to recover the token from. Please try changing your card instead.');
      }

      // Verify with Flutterwave
      const verifyResp = await fetch(`${FLUTTERWAVE_BASE_URL}/transactions/${flwTransactionId}/verify`, {
        headers: { 'Authorization': `Bearer ${secretKey}` },
      });
      const verifyData = await verifyResp.json();
      console.log('User recover token verify:', JSON.stringify(verifyData));

      if (verifyData.status !== 'success' || verifyData.data?.status !== 'successful') {
        throw new Error('Transaction verification failed. The original payment may not have completed.');
      }

      const cardData = verifyData.data.card;
      if (!cardData?.token) {
        throw new Error('No card token available from the payment provider. Please try changing your card instead.');
      }

      // Update the placeholder with the real token
      const { error: updateError } = await supabase
        .from('card_tokens')
        .update({
          card_token: cardData.token,
          card_last4: cardData.last_4digits,
          card_type: cardData.type,
          card_expiry: cardData.expiry,
          first_6digits: cardData.first_6digits,
          last_tokenized_at: new Date().toISOString(),
        })
        .eq('id', placeholderToken.id);

      if (updateError) throw new Error('Failed to update card token');

      return new Response(JSON.stringify({
        success: true,
        message: 'Card token recovered successfully.',
        card_last4: cardData.last_4digits,
        card_type: cardData.type,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========================================
    // ACTION: RETOKENIZE — Replace existing card (24hr cooldown)
    // ========================================
    if (action === 'retokenize') {
      // Check 24hr cooldown
      const { data: existingCard } = await supabase
        .from('card_tokens')
        .select('id, last_tokenized_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('card_status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existingCard?.last_tokenized_at) {
        const lastTokenized = new Date(existingCard.last_tokenized_at).getTime();
        const now = Date.now();
        const hoursSince = (now - lastTokenized) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          const hoursLeft = Math.ceil(24 - hoursSince);
          throw new Error(`You can only change your card once every 24 hours. Please try again in ${hoursLeft} hour(s).`);
        }
      }

      // Get user profile for checkout
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', user.id)
        .single();

      const flwPublicKey = Deno.env.get('FLUTTERWAVE_PUBLIC_KEY');
      const txRef = `retoken-${user.id.slice(0, 8)}-${Date.now()}`;
      const origin = req.headers.get('origin') || 'https://wesave.lovable.app';
      const redirectUrl = `${origin}/profile`;

      // Use a small auth charge amount (e.g. 50 NGN)
      const authAmount = 50;

      return new Response(JSON.stringify({
        success: true,
        payment_config: {
          public_key: flwPublicKey || '',
          tx_ref: txRef,
          amount: authAmount,
          currency: 'NGN',
          redirect_url: redirectUrl,
          customer: {
            email: profile?.email || '',
            name: profile?.full_name || 'Vestara User',
          },
          customizations: {
            title: 'Vestara Card Update',
            description: 'Authorize your new card for recurring payments',
          },
          meta: {
            purpose: 'retokenization',
            user_id: user.id,
          },
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========================================
    // ACTION: VERIFY_RETOKENIZE — Verify new card and replace old token
    // ========================================
    if (action === 'verify_retokenize') {
      const { transactionId, txRef } = body;
      if (!transactionId) throw new Error('Transaction ID is required');

      const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
      if (!secretKey) throw new Error('Flutterwave secret key not configured');

      const verifyResp = await fetch(`${FLUTTERWAVE_BASE_URL}/transactions/${transactionId}/verify`, {
        headers: { 'Authorization': `Bearer ${secretKey}` },
      });
      const verifyData = await verifyResp.json();
      console.log('Retokenization verify response:', JSON.stringify(verifyData));

      if (verifyData.status !== 'success' || verifyData.data?.status !== 'successful') {
        throw new Error('Transaction verification failed');
      }

      const txData = verifyData.data;
      const cardData = txData.card;
      if (!cardData?.token) {
        throw new Error('No card token returned. Please try again.');
      }

      // Deactivate all existing tokens
      await supabase
        .from('card_tokens')
        .update({ is_active: false, card_status: 'revoked' })
        .eq('user_id', user.id)
        .eq('is_active', true);

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
        last_tokenized_at: new Date().toISOString(),
      });

      // Credit the auth charge to wallet
      const amount = txData.amount;
      if (amount > 0) {
        await supabase.rpc('credit_wallet_atomic', {
          _user_id: user.id,
          _amount: amount,
          _tx_ref: txRef || txData.tx_ref,
          _description: 'Card re-authorization deposit — credited to wallet',
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Card updated successfully.',
        card_last4: cardData.last_4digits,
        card_type: cardData.type,
        amount_credited: amount,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // recover_token is handled above (before auth check)

    throw new Error(`Unknown action: ${action}`);

  } catch (error: unknown) {
    console.error('Card tokenization error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
