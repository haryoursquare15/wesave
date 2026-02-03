import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS - restrict to application domains
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
const PLATFORM_FEE_PERCENTAGE = 0.02; // 2%

// Platform bank account for service fee collection
// This should be configured with your actual Flutterwave settlement account
const PLATFORM_BANK_CODE = "044"; // Access Bank (example)
const PLATFORM_ACCOUNT_NUMBER = Deno.env.get('PLATFORM_BANK_ACCOUNT') || ""; // Platform's bank account

// Transfer service fee to platform account
async function transferServiceFee(
  secretKey: string, 
  amount: number, 
  groupId: string,
  supabaseClient: any
) {
  try {
    // Skip if no platform account configured or amount too small
    if (!PLATFORM_ACCOUNT_NUMBER || amount < 100) {
      console.log(`Service fee transfer skipped: amount=${amount}, accountConfigured=${!!PLATFORM_ACCOUNT_NUMBER}`);
      // Mark the service fee transaction as completed anyway (internal ledger tracking)
      await supabaseClient
        .from('transactions')
        .update({ 
          status: 'completed',
          description: 'Platform service fee (ledger tracked)'
        })
        .eq('group_id', groupId)
        .eq('type', 'service_fee')
        .eq('status', 'pending');
      return { success: true, skipped: true };
    }

    const transferRef = `fee-${groupId}-${Date.now()}`;

    const transferResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/transfers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_bank: PLATFORM_BANK_CODE,
        account_number: PLATFORM_ACCOUNT_NUMBER,
        amount: amount,
        currency: 'NGN',
        narration: `ThriftPal service fee - ${groupId}`,
        reference: transferRef,
        debit_currency: 'NGN',
      }),
    });

    const transferData = await transferResponse.json();
    console.log('Service fee transfer response:', JSON.stringify(transferData));

    if (transferData.status === 'success') {
      // Update the pending service fee transaction to completed
      await supabaseClient
        .from('transactions')
        .update({ 
          status: 'completed',
          reference: transferRef,
          description: 'Platform service fee (transferred)'
        })
        .eq('group_id', groupId)
        .eq('type', 'service_fee')
        .eq('status', 'pending');
      
      return { success: true, reference: transferRef };
    } else {
      console.error('Service fee transfer failed:', transferData);
      // Mark as failed but don't throw - payout was already processed
      await supabaseClient
        .from('transactions')
        .update({ 
          status: 'failed',
          description: `Platform service fee (transfer failed: ${transferData.message || 'Unknown error'})`
        })
        .eq('group_id', groupId)
        .eq('type', 'service_fee')
        .eq('status', 'pending');
      
      return { success: false, error: transferData.message };
    }
  } catch (error) {
    console.error('Error transferring service fee:', error);
    return { success: false, error: 'Transfer failed' };
  }
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
          console.error('RPC error:', rpcError);
          throw new Error('Failed to process contribution');
        }

        if (!result.success) {
          // Return clearer error messages
          const errorMsg = result.error || 'Contribution failed';
          if (errorMsg === 'No active cycle') {
            throw new Error('No active contribution cycle. Please wait for the next cycle to begin.');
          }
          if (errorMsg === 'Already contributed') {
            throw new Error('You have already contributed to this cycle.');
          }
          if (errorMsg === 'Insufficient funds') {
            throw new Error('Insufficient wallet balance. Please fund your wallet first.');
          }
          throw new Error(errorMsg);
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

        // Transfer service fee to platform Flutterwave account
        if (payoutResult.platform_fee > 0) {
          await transferServiceFee(FLUTTERWAVE_SECRET_KEY, payoutResult.platform_fee, groupId, supabase);
        }

        result = payoutResult;
        break;
      }

      case 'exit_group': {
        const { groupId } = params;
        if (!groupId) {
          throw new Error('Group ID is required');
        }

        const { data: exitResult, error: rpcError } = await supabase.rpc('exit_completed_group', {
          _group_id: groupId,
        });

        if (rpcError) {
          console.error('Exit group RPC error:', rpcError);
          throw new Error('Failed to exit group');
        }

        if (!exitResult.success) {
          throw new Error(exitResult.error || 'Failed to exit group');
        }

        result = exitResult;
        break;
      }

      case 'restart_group': {
        const { groupId } = params;
        if (!groupId) {
          throw new Error('Group ID is required');
        }

        const { data: restartResult, error: rpcError } = await supabase.rpc('restart_completed_group', {
          _group_id: groupId,
        });

        if (rpcError) {
          console.error('Restart group RPC error:', rpcError);
          throw new Error('Failed to restart group');
        }

        if (!restartResult.success) {
          throw new Error(restartResult.error || 'Failed to restart group');
        }

        result = restartResult;
        break;
      }

      case 'confirm_continue': {
        const { groupId } = params;
        if (!groupId) {
          throw new Error('Group ID is required');
        }

        const { data: confirmResult, error: rpcError } = await supabase.rpc('confirm_continue_group', {
          _group_id: groupId,
        });

        if (rpcError) {
          console.error('Confirm continue RPC error:', rpcError);
          throw new Error('Failed to confirm continuation');
        }

        if (!confirmResult.success) {
          throw new Error(confirmResult.error || 'Failed to confirm continuation');
        }

        result = confirmResult;
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
        // SECURITY FIX: Use atomic function to prevent race condition double-credit
        const { tx_ref } = params;
        if (!tx_ref) {
          throw new Error('Transaction reference is required');
        }

        // Verify with Flutterwave FIRST (before any database operations)
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
          // Payment was successful - use atomic function to credit wallet
          // This prevents race conditions where multiple requests could double-credit
          const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_atomic', {
            _user_id: user.id,
            _amount: verifyData.data.amount,
            _tx_ref: tx_ref,
            _description: 'Wallet funding',
          });

          if (creditError) {
            console.error('Credit wallet error:', creditError);
            result = { 
              success: false, 
              error: 'Failed to credit wallet' 
            };
          } else if (!creditResult?.success) {
            result = { 
              success: false, 
              error: creditResult?.error || 'Failed to credit wallet' 
            };
          } else {
            result = {
              success: true,
              message: creditResult.duplicate 
                ? 'Transaction already processed' 
                : 'Payment verified and wallet credited',
              amount: verifyData.data.amount,
              new_balance: creditResult.new_balance,
              verified: true,
              already_completed: creditResult.duplicate || false,
            };
            console.log(`Wallet credited atomically: ${user.id}, Amount: ${verifyData.data.amount}, New Balance: ${creditResult.new_balance}`);
          }
        } else if (verifyData.data?.status === 'failed') {
          // Payment failed - mark transaction as failed
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
      // Preserve clear error messages for the user
      if (msg.includes('no active contribution cycle') || msg.includes('no active cycle')) {
        userMessage = 'No active contribution cycle. Please wait for the next cycle to begin.';
      } else if (msg.includes('already contributed')) {
        userMessage = 'You have already contributed to this cycle.';
      } else if (msg.includes('insufficient') || msg.includes('wallet balance')) {
        userMessage = 'Insufficient wallet balance. Please fund your wallet first.';
      } else if (msg.includes('unauthorized') || msg.includes('no authorization')) {
        userMessage = 'Authentication required';
      } else if (msg.includes('group id') || msg.includes('required')) {
        userMessage = 'Missing required information';
      } else if (msg.includes('minimum')) {
        userMessage = 'Amount does not meet minimum requirements';
      } else if (msg.includes('not found')) {
        userMessage = 'Resource not found';
      } else if (msg.includes('not a member')) {
        userMessage = 'You are not a member of this group';
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
