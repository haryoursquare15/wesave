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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
  };
}

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, ...params } = await req.json();
    console.log(`Processing wallet action: ${action} for user: ${user.id}`);

    let result;

    switch (action) {
      case 'fund_wallet': {
        const { amount } = params;
        if (!amount || amount < 100) {
          throw new Error('Minimum funding amount is ₦100');
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        const txRef = `fund-${user.id}-${Date.now()}`;

        const paymentLinkResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/payments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tx_ref: txRef,
            amount: amount,
            currency: 'NGN',
            redirect_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/flutterwave-webhook?type=funding_redirect`,
            customer: {
              email: user.email,
              phonenumber: profile?.phone || '',
              name: profile?.full_name || 'User',
            },
            customizations: {
              title: 'ThriftPal Wallet Funding',
              description: 'Add funds to your ThriftPal wallet',
              logo: 'https://thriftpal.app/logo.png',
            },
            meta: {
              user_id: user.id,
              type: 'wallet_funding',
            },
          }),
        });

        const paymentData = await paymentLinkResponse.json();
        console.log('Payment link response:', JSON.stringify(paymentData));

        if (paymentData.status !== 'success') {
          throw new Error(paymentData.message || 'Failed to generate payment link');
        }

        await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            type: 'funding',
            amount: amount,
            status: 'pending',
            reference: txRef,
            description: 'Wallet funding',
          });

        result = {
          success: true,
          payment_link: paymentData.data.link,
          tx_ref: txRef,
        };
        break;
      }

      case 'verify_transaction': {
        const { tx_ref } = params;
        if (!tx_ref) {
          throw new Error('Transaction reference is required');
        }

        const verifyResponse = await fetch(
          `${FLUTTERWAVE_BASE_URL}/transactions/verify_by_reference?tx_ref=${tx_ref}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            },
          }
        );

        const verifyData = await verifyResponse.json();
        console.log('Verification response:', JSON.stringify(verifyData));

        if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
          const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_atomic', {
            _user_id: user.id,
            _amount: verifyData.data.amount,
            _tx_ref: tx_ref,
            _description: 'Wallet funding',
          });

          if (creditError) {
            console.error('Credit wallet error:', creditError);
            result = { success: false, error: 'Failed to credit wallet' };
          } else if (!creditResult?.success) {
            result = { success: false, error: creditResult?.error || 'Failed to credit wallet' };
          } else {
            result = {
              success: true,
              message: creditResult.duplicate ? 'Transaction already processed' : 'Payment verified and wallet credited',
              amount: verifyData.data.amount,
              new_balance: creditResult.new_balance,
              verified: true,
              already_completed: creditResult.duplicate || false,
            };
          }
        } else if (verifyData.data?.status === 'failed') {
          await supabase.from('transactions').update({ status: 'failed' }).eq('reference', tx_ref);
          result = { success: false, error: 'Payment failed', verified: true };
        } else {
          result = { success: false, error: 'Payment verification pending', status: verifyData.data?.status || 'unknown', verified: false };
        }
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Wallet error:', error);
    let userMessage = 'An error occurred';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('unauthorized')) userMessage = 'Authentication required';
      else if (msg.includes('minimum')) userMessage = 'Amount does not meet minimum requirements';
    }
    return new Response(JSON.stringify({ success: false, error: userMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
