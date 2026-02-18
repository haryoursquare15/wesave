import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  'https://wesave.lovable.app',
  'https://thrift-harmony-hub.lovable.app',
  'https://id-preview--52f5b582-a468-4659-81c8-2245803e62d4.lovable.app',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || '') ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, verif-hash, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
  };
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const FLUTTERWAVE_SECRET_KEY = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!FLUTTERWAVE_SECRET_KEY) {
      throw new Error('FLUTTERWAVE_SECRET_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a redirect from payment
    const url = new URL(req.url);
    if (url.searchParams.get('type') === 'funding_redirect') {
      const status = url.searchParams.get('status');
      const txRef = url.searchParams.get('tx_ref') || '';
      
      // Determine the app origin from allowed origins
      const appOrigin = 'https://wesave.lovable.app';
      const redirectUrl = status === 'successful' 
        ? `${appOrigin}/wallet?funding=success&tx_ref=${encodeURIComponent(txRef)}`
        : `${appOrigin}/wallet?funding=failed`;
      
      return new Response(null, {
        status: 302,
        headers: { 'Location': redirectUrl },
      });
    }

    // Verify webhook signature
    const verifHash = req.headers.get('verif-hash');
    const secretHash = Deno.env.get('FLUTTERWAVE_WEBHOOK_SECRET');
    
    if (!secretHash) {
      console.error('FLUTTERWAVE_WEBHOOK_SECRET is not configured');
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!verifHash || verifHash !== secretHash) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('Webhook signature verified');

    const payload = await req.json();
    console.log('Webhook received:', JSON.stringify(payload));

    const eventId = payload.id || `${payload.data?.id}-${Date.now()}`;
    const eventType = payload.event;

    // Idempotency check
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('event_id', eventId)
      .single();

    if (existingEvent?.processed) {
      console.log('Event already processed:', eventId);
      return new Response(JSON.stringify({ status: 'already_processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Record event
    await supabase
      .from('webhook_events')
      .upsert({
        event_id: eventId,
        event_type: eventType,
        payload: payload,
        processed: false,
      });

    switch (eventType) {
      case 'charge.completed': {
        const data = payload.data;
        
        if (data.status !== 'successful') {
          console.log('Charge not successful:', data.status);
          
          // Check if this is a card fallback contribution that failed
          const meta = data.meta || {};
          if (meta.type === 'card_fallback_contribution' && meta.user_id && meta.group_id) {
            console.log(`Card fallback charge failed for user ${meta.user_id}`);
            // The retry record was already created by the auto-contribution function
          }
          break;
        }

        const meta = data.meta || {};
        const txRef = data.tx_ref;

        if (meta.type === 'card_fallback_contribution') {
          // Card fallback for contribution — handle async charge completion
          const userId = meta.user_id;
          const groupId = meta.group_id;
          const cycleId = meta.cycle_id;

          if (!userId || !groupId) {
            console.error('Missing user_id or group_id in card fallback meta');
            break;
          }

          console.log(`Processing async card fallback for user ${userId}, group ${groupId}`);

          // Check if this was already handled synchronously
          const { data: existingRetry } = await supabase
            .from('contribution_retries')
            .select('status')
            .eq('transaction_reference', txRef)
            .single();

          if (existingRetry?.status === 'paid') {
            console.log('Card fallback already processed synchronously');
            break;
          }

          // Credit wallet atomically
          const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_atomic', {
            _user_id: userId,
            _amount: data.amount,
            _tx_ref: txRef,
            _description: 'Card fallback funding for contribution',
          });

          if (creditError || !creditResult?.success) {
            console.error('Failed to credit wallet from async card fallback:', creditError || creditResult?.error);
            break;
          }

          // Process contribution
          const { data: contribResult, error: contribError } = await supabase.rpc('process_contribution_ledger_atomic', {
            _user_id: userId,
            _group_id: groupId,
            _amount: data.amount,
          });

          if (contribError || !contribResult?.success) {
            console.error('Async card fallback: wallet funded but contribution failed:', contribError || contribResult?.error);
            // Wallet was credited, contribution will need manual handling
            break;
          }

          // Update retry record
          await supabase
            .from('contribution_retries')
            .update({
              status: 'paid',
              payment_source: 'card_fallback',
              transaction_reference: txRef,
            })
            .eq('user_id', userId)
            .eq('group_id', groupId)
            .eq('cycle_id', cycleId)
            .in('status', ['pending', 'failed', 'processing']);

          // Notify
          await supabase.from('chat_messages').insert({
            group_id: groupId,
            user_id: userId,
            message: `Card fallback contribution of ₦${Number(data.amount).toLocaleString()} processed successfully`,
            message_type: 'card_fallback_success',
          });

          console.log(`Async card fallback contribution completed for user ${userId}`);

          // Save/update card token for future use
          if (data.card?.token) {
            const { data: existingToken } = await supabase
              .from('card_tokens')
              .select('id')
              .eq('user_id', userId)
              .eq('card_token', data.card.token)
              .single();

            if (!existingToken) {
              await supabase.from('card_tokens').insert({
                user_id: userId,
                card_token: data.card.token,
                card_last4: data.card.last_4digits,
                card_type: data.card.type,
                card_expiry: data.card.expiry,
                is_active: true,
              });
            }
          }

        } else if (txRef?.startsWith('token-')) {
          // Card tokenization for group joining
          // tx_ref format: token-<userId8>-<groupId8>-<timestamp>
          const txParts = txRef.split('-');
          const userIdPrefix = txParts[1]; // first 8 chars of user_id
          const groupIdPrefix = txParts[2]; // first 8 chars of group_id

          // Look up user by prefix match
          const { data: matchedProfile } = await supabase
            .from('profiles')
            .select('id')
            .like('id', `${userIdPrefix}%`)
            .single();

          const userId = meta.user_id || matchedProfile?.id;
          if (!userId) {
            console.error('Could not determine user ID for tokenization tx_ref:', txRef);
            break;
          }

          // Look up group by prefix match
          const { data: matchedGroup } = await supabase
            .from('thrift_groups')
            .select('id, contribution_amount')
            .like('id', `${groupIdPrefix}%`)
            .single();

          const groupId = meta.group_id || matchedGroup?.id;
          if (!groupId) {
            console.error('Could not determine group ID for tokenization tx_ref:', txRef);
            break;
          }

          console.log(`Processing card tokenization for user ${userId}, group ${groupId}`);

          // Save card token if available
          if (data.card?.token) {
            const { data: existingToken } = await supabase
              .from('card_tokens')
              .select('id')
              .eq('user_id', userId)
              .eq('card_token', data.card.token)
              .single();

            if (!existingToken) {
              // Deactivate existing tokens
              await supabase
                .from('card_tokens')
                .update({ is_active: false, card_status: 'revoked' })
                .eq('user_id', userId)
                .eq('is_active', true);

              await supabase.from('card_tokens').insert({
                user_id: userId,
                card_token: data.card.token,
                card_last4: data.card.last_4digits,
                card_type: data.card.type,
                card_expiry: data.card.expiry,
                first_6digits: data.card.first_6digits,
                charge_email: data.customer?.email || null,
                is_active: true,
                card_status: 'active',
                group_id: groupId,
                recurring_amount: matchedGroup?.contribution_amount || data.amount,
              });
              console.log(`Card token saved for user ${userId}`);
            }
          }

          // Mark membership as tokenized
          await supabase.from('group_memberships').update({
            tokenization_completed: true,
            terms_accepted_at: new Date().toISOString(),
          }).eq('group_id', groupId).eq('user_id', userId).eq('status', 'active');

          // Credit wallet with the tokenization amount
          if (data.amount > 0) {
            const { error: creditError } = await supabase.rpc('credit_wallet_atomic', {
              _user_id: userId,
              _amount: data.amount,
              _tx_ref: txRef,
              _description: 'Card authorization deposit — credited to wallet',
            });

            if (creditError) {
              console.error('Failed to credit wallet after tokenization:', creditError);
            } else {
              console.log(`Wallet credited ₦${data.amount} for tokenization user ${userId}`);
            }
          }

          console.log(`Card tokenization completed for user ${userId}, group ${groupId}`);

        } else if (txRef?.startsWith('retoken-')) {
          // Re-tokenization: save new card token and credit wallet
          const txParts = txRef.split('-');
          const userIdPrefix = txParts[1]; // first 8 chars of user_id

          const { data: matchedProfile } = await supabase
            .from('profiles')
            .select('id')
            .like('id', `${userIdPrefix}%`)
            .single();

          const userId = meta.user_id || matchedProfile?.id;
          if (!userId) {
            console.error('Could not determine user ID for retoken tx_ref:', txRef);
            break;
          }

          console.log(`Processing re-tokenization webhook for user ${userId}`);

          // Get card token - webhook may not include it, so fetch from Flutterwave API
          let cardToken = data.card?.token;
          let cardData = data.card;
          
          if (!cardToken && data.id) {
            console.log('No card token in webhook payload, fetching from Flutterwave API...');
            try {
              const verifyResp = await fetch(`https://api.flutterwave.com/v3/transactions/${data.id}/verify`, {
                headers: { 'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}` },
              });
              const verifyResult = await verifyResp.json();
              if (verifyResult.status === 'success' && verifyResult.data?.card?.token) {
                cardToken = verifyResult.data.card.token;
                cardData = verifyResult.data.card;
                console.log('Card token retrieved from Flutterwave API');
              }
            } catch (fetchErr) {
              console.error('Failed to fetch card token from API:', fetchErr);
            }
          }

          // Save card token if available
          if (cardToken) {
            const { data: existingToken } = await supabase
              .from('card_tokens')
              .select('id')
              .eq('user_id', userId)
              .eq('card_token', cardToken)
              .single();

            if (!existingToken) {
              // Deactivate existing tokens
              await supabase
                .from('card_tokens')
                .update({ is_active: false, card_status: 'revoked' })
                .eq('user_id', userId)
                .eq('is_active', true);

              await supabase.from('card_tokens').insert({
                user_id: userId,
                card_token: cardToken,
                card_last4: cardData?.last_4digits || data.card?.last_4digits,
                card_type: cardData?.type || data.card?.type,
                card_expiry: cardData?.expiry || data.card?.expiry,
                first_6digits: cardData?.first_6digits || data.card?.first_6digits,
                charge_email: data.customer?.email || null,
                is_active: true,
                card_status: 'active',
                last_tokenized_at: new Date().toISOString(),
              });
              console.log(`Re-tokenization: new card saved for user ${userId}`);
            }
          } else {
            console.error('Could not obtain card token for re-tokenization, user must verify from profile');
          }

          // Credit the auth charge to wallet
          if (data.amount > 0) {
            const { error: creditError } = await supabase.rpc('credit_wallet_atomic', {
              _user_id: userId,
              _amount: data.amount,
              _tx_ref: txRef,
              _description: 'Card re-authorization deposit — credited to wallet',
            });

            if (creditError) {
              console.error('Failed to credit wallet after re-tokenization:', creditError);
            } else {
              console.log(`Wallet credited ₦${data.amount} for re-tokenization user ${userId}`);
            }
          }

        } else if (meta.type === 'wallet_funding' || txRef?.startsWith('fund-')) {
          // Standard wallet funding
          // tx_ref format: fund-<uuid>-<timestamp>, extract UUID (segments 1-5)
          const txParts = txRef?.split('-') || [];
          const userId = meta.user_id || (txParts.length >= 6 ? txParts.slice(1, 6).join('-') : null);
          
          if (!userId) {
            console.error('Could not determine user ID');
            break;
          }

          const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_atomic', {
            _user_id: userId,
            _amount: data.amount,
            _tx_ref: txRef,
            _description: 'Wallet funding',
          });

          if (creditError || !creditResult?.success) {
            console.error('Failed to credit wallet:', creditError || creditResult?.error);
            break;
          }

          console.log(`Wallet funded: ${userId}, Amount: ${data.amount}`);

          // Save card token if available (for future card fallback)
          if (data.card?.token && userId) {
            const { data: existingToken } = await supabase
              .from('card_tokens')
              .select('id')
              .eq('user_id', userId)
              .eq('card_token', data.card.token)
              .single();

            if (!existingToken) {
              await supabase.from('card_tokens').insert({
                user_id: userId,
                card_token: data.card.token,
                card_last4: data.card.last_4digits,
                card_type: data.card.type,
                card_expiry: data.card.expiry,
                is_active: true,
              });
              console.log(`Card token saved for user ${userId}`);
            }
          }
        }
        break;
      }

      case 'transfer.completed': {
        const data = payload.data;
        const reference = data.reference;

        // Handle group payouts
        await supabase
          .from('payouts')
          .update({
            status: data.status === 'SUCCESSFUL' ? 'completed' : 'failed',
            flw_transfer_id: data.id?.toString(),
            processed_at: new Date().toISOString(),
          })
          .eq('flw_transfer_ref', reference);

        // Handle user withdrawal transfers (wd-* references)
        if (reference?.startsWith('wd-')) {
          // Extract user_id from reference: wd-<uuid>-<timestamp>
          const refParts = reference.split('-');
          // UUID is segments 1-5 (after 'wd-')
          const userId = refParts.length >= 7 ? refParts.slice(1, 6).join('-') : null;

          if (!userId) {
            console.error('Could not extract user_id from withdrawal reference:', reference);
            break;
          }

          // Fetch the frozen amount from the transaction record
          const { data: txRecord } = await supabase
            .from('transactions')
            .select('amount, status')
            .eq('reference', reference)
            .single();

          if (!txRecord) {
            console.error('No transaction record found for withdrawal:', reference);
            break;
          }

          const frozenAmount = Number(txRecord.amount);

          if (data.status === 'SUCCESSFUL') {
            // ✅ Permanently deduct frozen funds
            const { data: confirmResult, error: confirmError } = await supabase.rpc('confirm_withdrawal_debit', {
              _user_id: userId,
              _amount: frozenAmount,
              _reference: reference,
              _description: `Withdrawal confirmed — ₦${data.amount} sent to bank`,
            });

            if (confirmError) {
              console.error('Failed to confirm withdrawal debit:', confirmError);
            }

            await supabase.from('transactions').update({
              status: 'completed',
              description: `Withdrawal completed — ₦${data.amount} sent to bank`,
            }).eq('reference', reference);

            console.log(`Withdrawal COMPLETED: ${reference}, amount: ${data.amount}`);

          } else {
            // ❌ Release frozen funds back to available
            const { data: releaseResult, error: releaseError } = await supabase.rpc('release_withdrawal_freeze', {
              _user_id: userId,
              _amount: frozenAmount,
              _reference: reference,
              _description: `Withdrawal failed — funds released (${data.complete_message || data.status})`,
            });

            if (releaseError) {
              console.error('Failed to release withdrawal freeze:', releaseError);
            }

            await supabase.from('transactions').update({
              status: 'failed',
              description: `Withdrawal failed — ${data.complete_message || 'transfer unsuccessful'}`,
            }).eq('reference', reference);

            console.log(`Withdrawal FAILED: ${reference}, reason: ${data.complete_message || data.status}`);
          }
        }

        console.log(`Transfer ${data.status}: ${reference}`);
        break;
      }

      default:
        console.log('Unhandled event type:', eventType);
    }

    // Mark event as processed
    await supabase
      .from('webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);

    return new Response(JSON.stringify({ status: 'success' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ 
      status: 'error',
      error: 'Webhook processing failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});