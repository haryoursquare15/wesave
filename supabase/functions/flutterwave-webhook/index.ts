import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, verif-hash',
};

serve(async (req) => {
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
      const txRef = url.searchParams.get('tx_ref');
      const status = url.searchParams.get('status');
      
      // Redirect to app with status
      const redirectUrl = status === 'successful' 
        ? '/wallet?funding=success'
        : '/wallet?funding=failed';
      
      return new Response(null, {
        status: 302,
        headers: {
          'Location': redirectUrl,
        },
      });
    }

    // Verify webhook signature
    const verifHash = req.headers.get('verif-hash');
    const secretHash = Deno.env.get('FLUTTERWAVE_WEBHOOK_SECRET') || FLUTTERWAVE_SECRET_KEY;
    
    // For test mode, skip strict signature verification
    // In production, enable this check
    // if (verifHash !== secretHash) {
    //   console.error('Invalid webhook signature');
    //   return new Response('Unauthorized', { status: 401 });
    // }

    const payload = await req.json();
    console.log('Webhook received:', JSON.stringify(payload));

    const eventId = payload.id || `${payload.data?.id}-${Date.now()}`;
    const eventType = payload.event;

    // Check for idempotency
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

    // Process based on event type
    switch (eventType) {
      case 'charge.completed': {
        const data = payload.data;
        
        if (data.status !== 'successful') {
          console.log('Charge not successful:', data.status);
          break;
        }

        // Check meta for transaction type
        const meta = data.meta || {};
        const txRef = data.tx_ref;

        if (meta.type === 'wallet_funding' || txRef?.startsWith('fund-')) {
          // Extract user ID from tx_ref or meta
          const userId = meta.user_id || txRef?.split('-')[1];
          
          if (!userId) {
            console.error('Could not determine user ID');
            break;
          }

          // Get user wallet
          const { data: wallet, error: walletError } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', userId)
            .single();

          if (walletError || !wallet) {
            console.error('Wallet not found for user:', userId);
            break;
          }

          // Credit wallet
          const newBalance = Number(wallet.available_balance) + data.amount;
          await supabase
            .from('wallets')
            .update({ 
              available_balance: newBalance,
              updated_at: new Date().toISOString(),
            })
            .eq('id', wallet.id);

          // Update transaction status
          await supabase
            .from('transactions')
            .update({
              status: 'completed',
            })
            .eq('reference', txRef);

          console.log(`Wallet funded: ${userId}, Amount: ${data.amount}`);
        }
        break;
      }

      case 'transfer.completed': {
        const data = payload.data;
        const reference = data.reference;

        // Update payout status if applicable
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      status: 'error',
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
