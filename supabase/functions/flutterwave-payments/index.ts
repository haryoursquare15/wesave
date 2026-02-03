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

        // Get user's wallet
        const { data: wallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (!wallet || Number(wallet.available_balance) < amount) {
          throw new Error('Insufficient wallet balance');
        }

        // Get active cycle
        const { data: cycle } = await supabase
          .from('contribution_cycles')
          .select('*')
          .eq('group_id', groupId)
          .eq('status', 'active')
          .single();

        if (!cycle) {
          throw new Error('No active contribution cycle');
        }

        // Check if already contributed
        const { data: existingContrib } = await supabase
          .from('cycle_contributions')
          .select('*')
          .eq('cycle_id', cycle.id)
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .single();

        if (existingContrib) {
          throw new Error('You have already contributed to this cycle');
        }

        // Deduct from wallet
        const newBalance = Number(wallet.available_balance) - amount;
        await supabase
          .from('wallets')
          .update({ available_balance: newBalance })
          .eq('id', wallet.id);

        // Record contribution
        const { data: contribution, error: contribError } = await supabase
          .from('cycle_contributions')
          .insert({
            cycle_id: cycle.id,
            group_id: groupId,
            user_id: user.id,
            amount: amount,
            status: 'completed',
            contributed_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (contribError) {
          // Rollback wallet deduction
          await supabase
            .from('wallets')
            .update({ available_balance: wallet.available_balance })
            .eq('id', wallet.id);
          throw new Error('Failed to record contribution');
        }

        // Record transaction
        await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            wallet_id: wallet.id,
            group_id: groupId,
            type: 'contribution',
            amount: amount,
            status: 'completed',
            description: `Contribution to group cycle ${cycle.cycle_number}`,
          });

        // Update cycle total
        await supabase
          .from('contribution_cycles')
          .update({
            total_contributions: Number(cycle.total_contributions) + amount,
          })
          .eq('id', cycle.id);

        // Update membership flag
        await supabase
          .from('group_memberships')
          .update({ has_contributed_this_cycle: true })
          .eq('group_id', groupId)
          .eq('user_id', user.id);

        // Add chat message
        await supabase
          .from('chat_messages')
          .insert({
            group_id: groupId,
            user_id: user.id,
            message: `has contributed ₦${amount.toLocaleString()} to the pool`,
            message_type: 'contribution_status',
          });

        // Check if all members have contributed
        const { count: memberCount } = await supabase
          .from('group_memberships')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .eq('status', 'active');

        const { count: contributionCount } = await supabase
          .from('cycle_contributions')
          .select('*', { count: 'exact', head: true })
          .eq('cycle_id', cycle.id)
          .eq('status', 'completed');

        if (contributionCount === memberCount) {
          // All contributed - trigger payout
          result = {
            success: true,
            message: 'Contribution recorded. All members have contributed!',
            all_contributed: true,
            contribution,
          };
        } else {
          result = {
            success: true,
            message: 'Contribution recorded successfully',
            all_contributed: false,
            contribution,
          };
        }
        break;
      }

      case 'process_payout': {
        const { groupId } = params;
        if (!groupId) {
          throw new Error('Group ID is required');
        }

        // Verify user is admin
        const { data: group } = await supabase
          .from('thrift_groups')
          .select('*')
          .eq('id', groupId)
          .eq('admin_id', user.id)
          .single();

        if (!group) {
          throw new Error('Only group admin can process payouts');
        }

        // Get active cycle
        const { data: cycle } = await supabase
          .from('contribution_cycles')
          .select('*')
          .eq('group_id', groupId)
          .eq('status', 'active')
          .single();

        if (!cycle) {
          throw new Error('No active contribution cycle');
        }

        // Get recipient
        const recipientId = cycle.payout_recipient_id;
        const { data: recipientWallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', recipientId)
          .single();

        if (!recipientWallet) {
          throw new Error('Recipient wallet not found');
        }

        const grossAmount = Number(cycle.total_contributions);
        const platformFee = grossAmount * PLATFORM_FEE_PERCENTAGE;
        const netAmount = grossAmount - platformFee;

        // Create payout record
        const { data: payout, error: payoutError } = await supabase
          .from('payouts')
          .insert({
            group_id: groupId,
            cycle_id: cycle.id,
            recipient_id: recipientId,
            gross_amount: grossAmount,
            platform_fee: platformFee,
            net_amount: netAmount,
            status: 'processing',
          })
          .select()
          .single();

        if (payoutError) {
          throw new Error('Failed to create payout record');
        }

        // Credit recipient wallet
        const newBalance = Number(recipientWallet.available_balance) + netAmount;
        await supabase
          .from('wallets')
          .update({ available_balance: newBalance })
          .eq('id', recipientWallet.id);

        // Record transaction
        await supabase
          .from('transactions')
          .insert({
            user_id: recipientId,
            wallet_id: recipientWallet.id,
            group_id: groupId,
            type: 'payout',
            amount: netAmount,
            status: 'completed',
            description: `Thrift payout for cycle ${cycle.cycle_number} (2% fee deducted)`,
          });

        // Update payout status
        await supabase
          .from('payouts')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', payout.id);

        // Update cycle
        await supabase
          .from('contribution_cycles')
          .update({
            status: 'completed',
            platform_fee: platformFee,
            payout_amount: netAmount,
            payout_date: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .eq('id', cycle.id);

        // Update membership
        await supabase
          .from('group_memberships')
          .update({ has_received_payout: true })
          .eq('group_id', groupId)
          .eq('user_id', recipientId);

        // Reset contribution flags
        await supabase
          .from('group_memberships')
          .update({ has_contributed_this_cycle: false })
          .eq('group_id', groupId);

        // Get recipient name
        const { data: recipientProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', recipientId)
          .single();

        // Add chat message
        await supabase
          .from('chat_messages')
          .insert({
            group_id: groupId,
            user_id: user.id,
            message: `Payout of ₦${netAmount.toLocaleString()} sent to ${recipientProfile?.full_name || 'member'} (2% fee: ₦${platformFee.toLocaleString()})`,
            message_type: 'payout_notification',
          });

        // Check if this was the last cycle
        const currentPosition = group.current_payout_position;
        const payoutOrder = group.payout_order || [];

        if (currentPosition >= payoutOrder.length) {
          // Thrift complete
          await supabase
            .from('thrift_groups')
            .update({ status: 'completed' })
            .eq('id', groupId);

          await supabase
            .from('chat_messages')
            .insert({
              group_id: groupId,
              user_id: user.id,
              message: 'Thrift cycle complete! All members have received their payouts.',
              message_type: 'system',
            });

          result = {
            success: true,
            message: 'Final payout processed. Thrift cycle complete!',
            thrift_complete: true,
            payout,
          };
        } else {
          // Start next cycle
          const nextRecipientId = payoutOrder[currentPosition];
          const nextCycleNumber = Number(cycle.cycle_number) + 1;

          // Calculate next deadline
          let nextDeadline: Date;
          const now = new Date();
          switch (group.period) {
            case 'daily':
              nextDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
              break;
            case 'weekly':
              nextDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
              break;
            case 'monthly':
              nextDeadline = new Date(now.setMonth(now.getMonth() + 1));
              break;
            default:
              nextDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          }

          await supabase
            .from('contribution_cycles')
            .insert({
              group_id: groupId,
              cycle_number: nextCycleNumber,
              payout_recipient_id: nextRecipientId,
              contribution_deadline: nextDeadline.toISOString(),
            });

          await supabase
            .from('thrift_groups')
            .update({
              current_cycle: nextCycleNumber,
              current_payout_position: currentPosition + 1,
              next_contribution_date: nextDeadline.toISOString(),
              next_payout_date: nextDeadline.toISOString(),
            })
            .eq('id', groupId);

          // Get next recipient name
          const { data: nextRecipientProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', nextRecipientId)
            .single();

          await supabase
            .from('chat_messages')
            .insert({
              group_id: groupId,
              user_id: user.id,
              message: `Cycle ${nextCycleNumber} started! Next payout: ${nextRecipientProfile?.full_name || 'member'}`,
              message_type: 'system',
            });

          result = {
            success: true,
            message: 'Payout processed. Next cycle started!',
            thrift_complete: false,
            payout,
            next_cycle: nextCycleNumber,
          };
        }
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

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Payment error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
