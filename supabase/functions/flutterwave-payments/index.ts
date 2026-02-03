import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";
const PLATFORM_FEE_PERCENTAGE = 0.02; // 2%

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
    console.log(`Processing payment action: ${action} for user: ${user.id}`);

    let result;

    switch (action) {
      case 'initiate_contribution': {
        const { groupId, amount } = params;
        if (!groupId || !amount) {
          throw new Error('Group ID and amount are required');
        }

        // Use atomic database function to prevent race conditions
        const { data: result, error: rpcError } = await supabase.rpc('process_contribution_atomic', {
          _user_id: user.id,
          _group_id: groupId,
          _amount: amount,
        });

        if (rpcError) {
          throw new Error('Failed to process contribution');
        }

        if (!result.success) {
          throw new Error(result.error || 'Contribution failed');
        }

        // Add chat message
        await supabase
          .from('chat_messages')
          .insert({
            group_id: groupId,
            user_id: user.id,
            message: `has contributed ₦${amount.toLocaleString()} to the pool`,
            message_type: 'contribution_status',
          });

        result.message = result.all_contributed
          ? 'Contribution recorded. All members have contributed!'
          : 'Contribution recorded successfully';

        break;
      }

      case 'process_payout': {
        const { groupId } = params;
        if (!groupId) {
          throw new Error('Group ID is required');
        }

        // Use atomic database function to prevent race conditions
        const { data: payoutResult, error: rpcError } = await supabase.rpc('process_payout_atomic', {
          _admin_id: user.id,
          _group_id: groupId,
        });

        if (rpcError) {
          throw new Error('Failed to process payout');
        }

        if (!payoutResult.success) {
          throw new Error(payoutResult.error || 'Payout failed');
        }

        result = payoutResult;
        break;
      }

      case 'fund_wallet': {
        // Generate payment link for wallet funding
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

        // Record pending transaction
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
        // Verify a pending transaction with Flutterwave
        const { tx_ref } = params;
        if (!tx_ref) {
          throw new Error('Transaction reference is required');
        }

        // Get the pending transaction
        const { data: pendingTx } = await supabase
          .from('transactions')
          .select('*')
          .eq('reference', tx_ref)
          .eq('user_id', user.id)
          .single();

        if (!pendingTx) {
          result = { success: false, error: 'Transaction not found' };
          break;
        }

        if (pendingTx.status === 'completed') {
          result = { success: true, message: 'Transaction already completed', already_completed: true };
          break;
        }

        // Verify with Flutterwave
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
          // Payment was successful - update wallet
          const amount = verifyData.data.amount;
          
          const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (wallet) {
            const newBalance = Number(wallet.available_balance) + amount;
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
              .update({ status: 'completed' })
              .eq('reference', tx_ref);

            console.log(`Wallet updated: ${user.id}, Amount: ${amount}, New Balance: ${newBalance}`);
          }

          result = {
            success: true,
            message: 'Payment verified and wallet credited',
            amount: amount,
            verified: true,
          };
        } else if (verifyData.data?.status === 'failed') {
          // Payment failed
          await supabase
            .from('transactions')
            .update({ status: 'failed' })
            .eq('reference', tx_ref);

          result = {
            success: false,
            error: 'Payment failed',
            verified: true,
          };
        } else {
          // Still pending or error
          result = {
            success: false,
            error: 'Payment verification pending or failed',
            status: verifyData.data?.status || 'unknown',
            verified: false,
          };
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
    console.error('Payment error:', error);
    
    // Map detailed errors to safe user-friendly messages
    let userMessage = 'An error occurred processing your request';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('unauthorized') || msg.includes('no authorization')) {
        userMessage = 'Authentication required';
      } else if (msg.includes('group id') || msg.includes('required')) {
        userMessage = 'Missing required information';
      } else if (msg.includes('minimum')) {
        userMessage = 'Amount does not meet minimum requirements';
      } else if (msg.includes('not found')) {
        userMessage = 'Resource not found';
      } else if (msg.includes('insufficient')) {
        userMessage = 'Insufficient funds';
      } else if (msg.includes('contribution failed') || msg.includes('payout failed')) {
        userMessage = 'Operation could not be completed';
      } else if (msg.includes('unknown action')) {
        userMessage = 'Invalid operation requested';
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: userMessage 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
