import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
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
      const redirectUrl = status === 'successful' 
        ? '/wallet?funding=success'
        : '/wallet?funding=failed';
      
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

        } else if (meta.type === 'wallet_funding' || txRef?.startsWith('fund-')) {
          // Standard wallet funding
          const userId = meta.user_id || txRef?.split('-')[1];
          
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

        await supabase
          .from('payouts')
          .update({
            status: data.status === 'SUCCESSFUL' ? 'completed' : 'failed',
            flw_transfer_id: data.id?.toString(),
            processed_at: new Date().toISOString(),
          })
          .eq('flw_transfer_ref', reference);

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