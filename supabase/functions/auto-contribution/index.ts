import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

interface CardFallbackResult {
  attempted: boolean;
  success: boolean;
  error?: string;
  tx_ref?: string;
}

async function insertNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  message: string,
  notificationType: string,
  groupId?: string
) {
  try {
    await supabase.from('user_notifications').insert({
      user_id: userId,
      title,
      message,
      notification_type: notificationType,
      group_id: groupId || null,
    });
  } catch (err) {
    console.error('Failed to insert notification:', err);
  }
}

async function attemptCardFallback(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  groupId: string,
  cycleId: string,
  amount: number,
  flwSecretKey: string
): Promise<CardFallbackResult> {
  // Check for active card token
  const { data: cardToken } = await supabase
    .from('card_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!cardToken) {
    return { attempted: false, success: false, error: 'No active card token found' };
  }

  // Check for existing retry record
  const { data: existingRetry } = await supabase
    .from('contribution_retries')
    .select('*')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .eq('cycle_id', cycleId)
    .in('status', ['pending', 'processing'])
    .single();

  if (existingRetry) {
    // Check retry limits
    if (existingRetry.retry_count >= existingRetry.max_retries) {
      // Mark as defaulted
      await supabase
        .from('contribution_retries')
        .update({ status: 'defaulted', failure_reason: 'Max retries exceeded', updated_at: new Date().toISOString() })
        .eq('id', existingRetry.id);
      return { attempted: false, success: false, error: 'Max retries reached - contribution defaulted' };
    }

    // Check if enough time has passed since last retry (24 hours)
    if (existingRetry.next_retry_at && new Date(existingRetry.next_retry_at) > new Date()) {
      return { attempted: false, success: false, error: 'Retry not yet due' };
    }
  }

  // Generate unique transaction reference
  const txRef = `card-contrib-${userId.slice(0, 8)}-${groupId.slice(0, 8)}-${Date.now()}`;

  // Use the charge_email stored on the card token (required by Flutterwave for tokenized charges)
  // Fall back to profile email only if charge_email is not available
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  const chargeEmail = cardToken.charge_email || profile?.email;
  if (!chargeEmail) {
    return { attempted: true, success: false, error: 'User email not found for card charge' };
  }

  try {
    // Attempt Flutterwave tokenized charge
    const chargeResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/tokenized-charges`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flwSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: cardToken.card_token,
        currency: 'NGN',
        country: 'NG',
        amount: amount,
        email: profile.email,
        full_name: profile.full_name || 'WeSave User',
        tx_ref: txRef,
        redirect_url: 'https://app.wesave.ng/dashboard',
        narration: `WeSave contribution - Group ${groupId.slice(0, 8)}`,
        meta: {
          type: 'card_fallback_contribution',
          user_id: userId,
          group_id: groupId,
          cycle_id: cycleId,
        },
      }),
    });

    const chargeData = await chargeResponse.json();
    console.log(`Card fallback charge response for user ${userId}:`, JSON.stringify(chargeData));

    if (chargeData.status === 'success' && chargeData.data?.status === 'successful') {
      // Charge succeeded immediately — credit wallet, then debit for contribution
      const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_atomic', {
        _user_id: userId,
        _amount: amount,
        _tx_ref: txRef,
        _description: 'Card fallback funding for contribution',
      });

      if (creditError || !creditResult?.success) {
        console.error('Failed to credit wallet after card charge:', creditError || creditResult?.error);
        return { attempted: true, success: false, error: 'Card charged but wallet credit failed', tx_ref: txRef };
      }

      // Now process the contribution from wallet
      const { data: contribResult, error: contribError } = await supabase.rpc('process_contribution_ledger_atomic', {
        _user_id: userId,
        _group_id: groupId,
        _amount: amount,
      });

      if (contribError || !contribResult?.success) {
        console.error('Card funded but contribution failed:', contribError || contribResult?.error);
        return { attempted: true, success: false, error: 'Card charged, wallet funded, but contribution failed', tx_ref: txRef };
      }

      // Update or create retry record as paid
      if (existingRetry) {
        await supabase
          .from('contribution_retries')
          .update({
            status: 'paid',
            payment_source: 'card_fallback',
            transaction_reference: txRef,
            last_retry_at: new Date().toISOString(),
            retry_count: existingRetry.retry_count + 1,
          })
          .eq('id', existingRetry.id);
      } else {
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
      }

      return { attempted: true, success: true, tx_ref: txRef };
    } else {
      // Charge failed or pending
      const now = new Date();
      const nextRetry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours later
      const newRetryCount = (existingRetry?.retry_count || 0) + 1;
      const isDefaulted = newRetryCount >= 3;

      if (existingRetry) {
        await supabase
          .from('contribution_retries')
          .update({
            status: isDefaulted ? 'defaulted' : 'failed',
            retry_count: newRetryCount,
            last_retry_at: now.toISOString(),
            next_retry_at: isDefaulted ? null : nextRetry.toISOString(),
            failure_reason: chargeData.message || 'Card charge failed',
            transaction_reference: txRef,
          })
          .eq('id', existingRetry.id);
      } else {
        await supabase.from('contribution_retries').insert({
          user_id: userId,
          group_id: groupId,
          cycle_id: cycleId,
          contribution_amount: amount,
          status: isDefaulted ? 'defaulted' : 'failed',
          payment_source: 'card_fallback',
          retry_count: newRetryCount,
          last_retry_at: now.toISOString(),
          next_retry_at: isDefaulted ? null : nextRetry.toISOString(),
          failure_reason: chargeData.message || 'Card charge failed',
          transaction_reference: txRef,
        });
      }

      return { attempted: true, success: false, error: chargeData.message || 'Card charge failed', tx_ref: txRef };
    }
  } catch (err) {
    console.error('Card fallback charge error:', err);
    return { attempted: true, success: false, error: err instanceof Error ? err.message : 'Unknown charge error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const FLUTTERWAVE_SECRET_KEY = Deno.env.get('FLUTTERWAVE_SECRET_KEY') || '';

    console.log('Auto-contribution job started at:', new Date().toISOString());

    // Parse request body for optional force_group_id (for manual testing)
    let forceGroupId: string | null = null;
    let processRetries = false;
    try {
      const body = await req.json();
      forceGroupId = body.force_group_id || null;
      processRetries = body.process_retries || false;
      
      // SECURITY: Manual triggers require authentication and admin verification
      if (forceGroupId) {
        console.log(`Manual trigger requested for group: ${forceGroupId}`);
        
        if (!UUID_REGEX.test(forceGroupId)) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid group ID format',
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Authentication required for manual trigger',
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Unauthorized - invalid token',
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const { data: isGroupAdmin } = await supabase.rpc('is_group_admin', {
          _group_id: forceGroupId,
        });
        
        const { data: isPlatformAdmin } = await supabase.rpc('is_any_admin', {
          _user_id: user.id,
        });
        
        if (!isGroupAdmin && !isPlatformAdmin) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Not authorized - must be group admin or platform admin',
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        console.log(`Manual trigger authorized for user ${user.id}`);
      }
    } catch {
      // No body or invalid JSON - that's fine for scheduled calls
    }

    // ---- Process pending retries (card fallback retries from previous failures) ----
    if (processRetries || !forceGroupId) {
      const { data: pendingRetries } = await supabase
        .from('contribution_retries')
        .select('*')
        .eq('status', 'failed')
        .lte('next_retry_at', new Date().toISOString())
        .limit(50);

      if (pendingRetries && pendingRetries.length > 0 && FLUTTERWAVE_SECRET_KEY) {
        console.log(`Processing ${pendingRetries.length} pending card fallback retries`);
        for (const retry of pendingRetries) {
          // Get active cycle to confirm it's still valid
          const { data: cycle } = await supabase
            .from('contribution_cycles')
            .select('id, status')
            .eq('id', retry.cycle_id)
            .eq('status', 'active')
            .single();

          if (!cycle) {
            // Cycle no longer active, mark as failed
            await supabase
              .from('contribution_retries')
              .update({ status: 'failed', failure_reason: 'Cycle no longer active' })
              .eq('id', retry.id);
            continue;
          }

          const result = await attemptCardFallback(
            supabase, retry.user_id, retry.group_id, retry.cycle_id,
            Number(retry.contribution_amount), FLUTTERWAVE_SECRET_KEY
          );

          console.log(`Retry result for user ${retry.user_id}:`, result);

          if (result.success) {
            await supabase.from('chat_messages').insert({
              group_id: retry.group_id,
              user_id: retry.user_id,
              message: `Card fallback contribution of ₦${Number(retry.contribution_amount).toLocaleString()} processed successfully (retry)`,
              message_type: 'card_fallback_success',
            });
          } else if (result.error?.includes('defaulted')) {
            await supabase.from('chat_messages').insert({
              group_id: retry.group_id,
              user_id: retry.user_id,
              message: `⚠️ Contribution defaulted after 3 failed attempts. Please fund your wallet manually.`,
              message_type: 'contribution_defaulted',
            });
          }
        }
      }
    }

    // ---- Catch-up sweep: process groups whose scheduled trigger was missed entirely ----
    const catchupResults: { groupId: string; groupName: string; catchupMembers: number; succeeded: number }[] = [];

    const { data: allActiveGroupsCatchup } = await supabase
      .from('thrift_groups')
      .select('id, name, contribution_amount, contribution_hour, contribution_minute, period')
      .eq('status', 'active');

    for (const group of allActiveGroupsCatchup || []) {
      // Skip if this is a force_group_id call (handled separately below)
      if (forceGroupId) continue;

      const { data: activeCycle } = await supabase
        .from('contribution_cycles')
        .select('id, cycle_number, created_at')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .single();

      if (!activeCycle) continue;

      // Get members who haven't contributed
      const { data: pendingMembers } = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .eq('has_contributed_this_cycle', false);

      if (!pendingMembers || pendingMembers.length === 0) continue;

      // Check if ANY contribution audit entries exist for this cycle at all
      const { count: auditCount } = await supabase
        .from('contribution_audit')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', group.id)
        .eq('cycle_id', activeCycle.id);

      // If some members have been processed but others haven't, the retry sweep handles that.
      // This catch-up only fires when the ENTIRE initial trigger was missed (zero audit entries)
      // AND the cycle has existed for more than 30 minutes (to avoid racing with a normal trigger)
      const cycleAge = Date.now() - new Date(activeCycle.created_at).getTime();
      const THIRTY_MINUTES = 30 * 60 * 1000;

      if ((auditCount || 0) > 0 || cycleAge < THIRTY_MINUTES) continue;

      console.log(`CATCH-UP: Group "${group.name}" has active cycle ${activeCycle.cycle_number} with ZERO contribution attempts. Processing now.`);

      let catchupSucceeded = 0;

      for (const member of pendingMembers) {
        // Attempt wallet deduction
        const { data: result, error: rpcError } = await supabase.rpc('process_contribution_ledger_atomic', {
          _user_id: member.user_id,
          _group_id: group.id,
          _amount: group.contribution_amount,
        });

        if (!rpcError && result?.success) {
          catchupSucceeded++;
          await supabase.from('contribution_audit').insert({
            user_id: member.user_id,
            group_id: group.id,
            cycle_id: activeCycle.id,
            amount: group.contribution_amount,
            contribution_type: 'auto',
            status: 'completed',
          });
          await supabase.from('chat_messages').insert({
            group_id: group.id,
            user_id: member.user_id,
            message: `Auto-contribution of ₦${group.contribution_amount.toLocaleString()} processed (catch-up)`,
            message_type: 'auto_contribution',
          });
          await insertNotification(supabase, member.user_id, 'Contribution Successful', `Your auto-contribution of ₦${group.contribution_amount.toLocaleString()} for ${group.name} was processed successfully.`, 'contribution_success', group.id);

          if (result.all_contributed && result.auto_payout?.success) {
            await supabase.from('chat_messages').insert({
              group_id: group.id,
              user_id: member.user_id,
              message: `🎉 Cycle complete! Payout of ₦${result.auto_payout.net_amount?.toLocaleString() || 'N/A'} sent to recipient.`,
              message_type: 'payout_notification',
            });
          }
        } else {
          const errorMsg = rpcError?.message || result?.error || '';
          // Attempt card fallback if insufficient funds
          if (errorMsg.toLowerCase().includes('insufficient') && FLUTTERWAVE_SECRET_KEY) {
            const fallbackResult = await attemptCardFallback(
              supabase, member.user_id, group.id, activeCycle.id,
              group.contribution_amount, FLUTTERWAVE_SECRET_KEY
            );

            if (fallbackResult.success) {
              catchupSucceeded++;
              await supabase.from('contribution_audit').insert({
                user_id: member.user_id,
                group_id: group.id,
                cycle_id: activeCycle.id,
                amount: group.contribution_amount,
                contribution_type: 'auto_card_fallback',
                status: 'completed',
              });
              await supabase.from('chat_messages').insert({
                group_id: group.id,
                user_id: member.user_id,
                message: `Auto-contribution of ₦${group.contribution_amount.toLocaleString()} processed via card (catch-up)`,
                message_type: 'card_fallback_success',
              });
              await insertNotification(supabase, member.user_id, 'Card Contribution Successful', `Your contribution of ₦${group.contribution_amount.toLocaleString()} for ${group.name} was charged to your card.`, 'card_fallback_success', group.id);
              continue;
            }
          }

          // Record failed attempt so retry sweep can pick it up
          await supabase.from('contribution_audit').insert({
            user_id: member.user_id,
            group_id: group.id,
            cycle_id: activeCycle.id,
            amount: group.contribution_amount,
            contribution_type: 'auto',
            status: 'failed',
          });
          await supabase.from('chat_messages').insert({
            group_id: group.id,
            user_id: member.user_id,
            message: `⚠️ Auto-contribution failed (catch-up). Will retry in 6 hours.`,
            message_type: 'contribution_failed',
          });
          await insertNotification(supabase, member.user_id, 'Contribution Failed', `Auto-contribution for ${group.name} failed. Will retry in 6 hours.`, 'contribution_failed', group.id);
        }
      }

      catchupResults.push({ groupId: group.id, groupName: group.name, catchupMembers: pendingMembers.length, succeeded: catchupSucceeded });
    }

    if (catchupResults.length > 0) {
      console.log('Catch-up sweep results:', JSON.stringify(catchupResults, null, 2));
    }

    // ---- Retry sweep: re-attempt contributions for members with < 3 attempts, 6h apart ----
    const MAX_CONTRIBUTION_ATTEMPTS = 3;
    const RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

    const retryResults: { groupId: string; groupName: string; retried: number; succeeded: number }[] = [];

    // Get all active groups with active cycles for retry sweep
    const { data: allActiveGroups } = await supabase
      .from('thrift_groups')
      .select('id, name, contribution_amount')
      .eq('status', 'active');

    for (const group of allActiveGroups || []) {
      const { data: activeCycle } = await supabase
        .from('contribution_cycles')
        .select('id, cycle_number')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .single();

      if (!activeCycle) continue;

      // Get members who haven't contributed
      const { data: pendingMembers } = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .eq('has_contributed_this_cycle', false);

      if (!pendingMembers || pendingMembers.length === 0) continue;

      let retriedCount = 0;
      let succeededCount = 0;

      for (const member of pendingMembers) {
        // Count previous auto attempts for this member in this cycle
        const { data: prevAttempts } = await supabase
          .from('contribution_audit')
          .select('id, created_at')
          .eq('user_id', member.user_id)
          .eq('group_id', group.id)
          .eq('cycle_id', activeCycle.id)
          .in('contribution_type', ['auto', 'auto_card_fallback', 'auto_retry', 'auto_retry_card_fallback'])
          .order('created_at', { ascending: false });

        const attemptCount = prevAttempts?.length || 0;

        // Skip if already hit max attempts
        if (attemptCount >= MAX_CONTRIBUTION_ATTEMPTS) continue;

        // Skip if no previous attempt (catch-up sweep or normal flow handles first attempt)
        if (!prevAttempts || prevAttempts.length === 0) continue;

        // Skip if not enough time has passed since last attempt
        const lastAttemptTime = new Date(prevAttempts[0].created_at).getTime();
        if (Date.now() - lastAttemptTime < RETRY_INTERVAL_MS) continue;

        console.log(`Retry attempt ${attemptCount + 1}/${MAX_CONTRIBUTION_ATTEMPTS} for user ${member.user_id} in group ${group.name}`);
        retriedCount++;

        // Step 1: Wallet-first
        const { data: result, error: rpcError } = await supabase.rpc('process_contribution_ledger_atomic', {
          _user_id: member.user_id,
          _group_id: group.id,
          _amount: group.contribution_amount,
        });

        if (!rpcError && result?.success) {
          succeededCount++;
          await supabase.from('contribution_audit').insert({
            user_id: member.user_id,
            group_id: group.id,
            cycle_id: activeCycle.id,
            amount: group.contribution_amount,
            contribution_type: 'auto_retry',
            status: 'completed',
          });
          await supabase.from('chat_messages').insert({
            group_id: group.id,
            user_id: member.user_id,
            message: `Auto-contribution of ₦${group.contribution_amount.toLocaleString()} processed (retry ${attemptCount + 1})`,
            message_type: 'auto_contribution',
          });
          await insertNotification(supabase, member.user_id, 'Contribution Successful', `Your auto-contribution of ₦${group.contribution_amount.toLocaleString()} for ${group.name} was processed successfully (attempt ${attemptCount + 1}).`, 'contribution_success', group.id);

          if (result.all_contributed && result.auto_payout?.success) {
            await supabase.from('chat_messages').insert({
              group_id: group.id,
              user_id: member.user_id,
              message: `🎉 Cycle complete! Payout of ₦${result.auto_payout.net_amount?.toLocaleString() || 'N/A'} sent to recipient.`,
              message_type: 'payout_notification',
            });
          }
          continue;
        }

        // Step 2: Card fallback if insufficient funds
        const errorMsg = rpcError?.message || result?.error || '';
        if (errorMsg.toLowerCase().includes('insufficient') && FLUTTERWAVE_SECRET_KEY) {
          const fallbackResult = await attemptCardFallback(
            supabase, member.user_id, group.id, activeCycle.id,
            group.contribution_amount, FLUTTERWAVE_SECRET_KEY
          );

          if (fallbackResult.success) {
            succeededCount++;
            await supabase.from('contribution_audit').insert({
              user_id: member.user_id,
              group_id: group.id,
              cycle_id: activeCycle.id,
              amount: group.contribution_amount,
              contribution_type: 'auto_retry_card_fallback',
              status: 'completed',
            });
            await supabase.from('chat_messages').insert({
              group_id: group.id,
              user_id: member.user_id,
              message: `Auto-contribution of ₦${group.contribution_amount.toLocaleString()} processed via card fallback (retry ${attemptCount + 1})`,
              message_type: 'card_fallback_success',
            });
            await insertNotification(supabase, member.user_id, 'Card Contribution Successful', `Your contribution of ₦${group.contribution_amount.toLocaleString()} for ${group.name} was charged to your card (attempt ${attemptCount + 1}).`, 'card_fallback_success', group.id);
            continue;
          }
        }

        // Failed retry
        await supabase.from('contribution_audit').insert({
          user_id: member.user_id,
          group_id: group.id,
          cycle_id: activeCycle.id,
          amount: group.contribution_amount,
          contribution_type: 'auto_retry',
          status: 'failed',
        });

        const isLastAttempt = attemptCount + 1 >= MAX_CONTRIBUTION_ATTEMPTS;
        await supabase.from('chat_messages').insert({
          group_id: group.id,
          user_id: member.user_id,
          message: isLastAttempt
            ? `❌ Auto-contribution failed after ${MAX_CONTRIBUTION_ATTEMPTS} attempts. Please contribute manually.`
            : `⚠️ Auto-contribution retry ${attemptCount + 1}/${MAX_CONTRIBUTION_ATTEMPTS} failed. Next retry in 6 hours.`,
          message_type: isLastAttempt ? 'contribution_defaulted' : 'contribution_failed',
        });
        await insertNotification(
          supabase, member.user_id,
          isLastAttempt ? 'Contribution Failed' : 'Contribution Retry Failed',
          isLastAttempt
            ? `All ${MAX_CONTRIBUTION_ATTEMPTS} auto-contribution attempts for ${group.name} have failed. Please contribute manually.`
            : `Auto-contribution attempt ${attemptCount + 1}/${MAX_CONTRIBUTION_ATTEMPTS} for ${group.name} failed. Next retry in 6 hours.`,
          isLastAttempt ? 'contribution_defaulted' : 'contribution_retry',
          group.id
        );
      }

      if (retriedCount > 0) {
        retryResults.push({ groupId: group.id, groupName: group.name, retried: retriedCount, succeeded: succeededCount });
      }
    }

    if (retryResults.length > 0) {
      console.log('Retry sweep results:', JSON.stringify(retryResults, null, 2));
    }

    // ---- Normal contribution flow (first attempt for newly due groups) ----
    const now = new Date();
    const watOffset = 1;
    const watHour = (now.getUTCHours() + watOffset) % 24;
    const watMinute = now.getUTCMinutes();
    const currentMinuteSlot = watMinute < 30 ? 0 : 30;
    
    let watDate = new Date(now);
    if (now.getUTCHours() + watOffset >= 24) {
      watDate.setUTCDate(watDate.getUTCDate() + 1);
    }
    const currentDayOfWeek = watDate.getUTCDay();
    const currentDayOfMonth = watDate.getUTCDate();

    console.log(`Current WAT time: Hour=${watHour}, Minute=${currentMinuteSlot}, DayOfWeek=${currentDayOfWeek}, DayOfMonth=${currentDayOfMonth}`);

    let dueGroups;
    let groupsError;

    if (forceGroupId) {
      const result = await supabase
        .from('thrift_groups')
        .select(`
          id, name, contribution_amount, period, max_members,
          contribution_hour, contribution_minute, contribution_day_of_week, contribution_day_of_month,
          current_cycle
        `)
        .eq('status', 'active')
        .eq('id', forceGroupId);
      
      dueGroups = result.data;
      groupsError = result.error;
    } else {
      const result = await supabase
        .from('thrift_groups')
        .select(`
          id, name, contribution_amount, period, max_members,
          contribution_hour, contribution_minute, contribution_day_of_week, contribution_day_of_month,
          current_cycle
        `)
        .eq('status', 'active')
        .eq('contribution_hour', watHour);
      
      dueGroups = result.data;
      groupsError = result.error;
    }

    if (groupsError) {
      console.error('Error fetching groups:', groupsError);
      throw groupsError;
    }

    console.log(`Found ${dueGroups?.length || 0} groups with matching hour`);

    const results: { groupId: string; groupName: string; success: boolean; details: string }[] = [];

    for (const group of dueGroups || []) {
      if (!forceGroupId) {
        const groupMinute = group.contribution_minute ?? 0;
        if (groupMinute !== currentMinuteSlot) {
          continue;
        }

        let isDue = false;
        if (group.period === 'daily') {
          isDue = true;
        } else if (group.period === 'weekly') {
          isDue = group.contribution_day_of_week === currentDayOfWeek;
        } else if (group.period === 'monthly') {
          isDue = group.contribution_day_of_month === currentDayOfMonth;
        }

        if (!isDue) continue;
      }

      console.log(`Processing auto-contribution for group: ${group.name} (${group.id})`);

      const { data: activeCycle } = await supabase
        .from('contribution_cycles')
        .select('id')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .single();

      if (!activeCycle) {
        results.push({ groupId: group.id, groupName: group.name, success: false, details: 'No active cycle' });
        continue;
      }

      const { data: members, error: membersError } = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .eq('has_contributed_this_cycle', false);

      if (membersError) {
        results.push({ groupId: group.id, groupName: group.name, success: false, details: `Error: ${membersError.message}` });
        continue;
      }

      let successCount = 0;
      let failCount = 0;
      let cardFallbackCount = 0;

      for (const member of members || []) {
        // Step 1: Attempt wallet deduction
        const { data: result, error: rpcError } = await supabase.rpc('process_contribution_ledger_atomic', {
          _user_id: member.user_id,
          _group_id: group.id,
          _amount: group.contribution_amount,
        });

        if (rpcError || !result?.success) {
          const errorMsg = rpcError?.message || result?.error || 'Unknown error';
          console.log(`Wallet contribution failed for user ${member.user_id}: ${errorMsg}`);

          // Step 2: If insufficient funds, attempt card fallback
          if (errorMsg.toLowerCase().includes('insufficient') && FLUTTERWAVE_SECRET_KEY) {
            console.log(`Attempting card fallback for user ${member.user_id}`);
            
            const fallbackResult = await attemptCardFallback(
              supabase, member.user_id, group.id, activeCycle.id,
              group.contribution_amount, FLUTTERWAVE_SECRET_KEY
            );

            if (fallbackResult.success) {
              successCount++;
              cardFallbackCount++;

              await supabase.from('chat_messages').insert({
                group_id: group.id,
                user_id: member.user_id,
                message: `Auto-contribution of ₦${group.contribution_amount.toLocaleString()} processed via card fallback`,
                message_type: 'card_fallback_success',
              });

              await supabase.from('contribution_audit').insert({
                user_id: member.user_id,
                group_id: group.id,
                cycle_id: activeCycle.id,
                amount: group.contribution_amount,
                contribution_type: 'auto_card_fallback',
                status: 'completed',
              });
              await insertNotification(supabase, member.user_id, 'Card Contribution Successful', `Your contribution of ₦${group.contribution_amount.toLocaleString()} for ${group.name} was charged to your card.`, 'card_fallback_success', group.id);
              continue;
            } else if (!fallbackResult.attempted) {
              await supabase.from('chat_messages').insert({
                group_id: group.id,
                user_id: member.user_id,
                message: `⚠️ Insufficient wallet balance and no saved card. Please fund your wallet to contribute.`,
                message_type: 'contribution_failed',
              });
              await insertNotification(supabase, member.user_id, 'Contribution Failed', `Insufficient wallet balance for ${group.name} and no saved card. Please fund your wallet. Will retry in 6 hours.`, 'contribution_failed', group.id);
            } else {
              await supabase.from('chat_messages').insert({
                group_id: group.id,
                user_id: member.user_id,
                message: `⚠️ Wallet balance insufficient and card charge failed. Will retry in 6 hours.`,
                message_type: 'card_fallback_failed',
              });
              await insertNotification(supabase, member.user_id, 'Card Charge Failed', `Wallet and card charge both failed for ${group.name}. Will retry in 6 hours.`, 'card_fallback_failed', group.id);
            }
          }

          failCount++;
          await supabase.from('contribution_audit').insert({
            user_id: member.user_id,
            group_id: group.id,
            cycle_id: activeCycle.id,
            amount: group.contribution_amount,
            contribution_type: 'auto',
            status: 'failed',
          });
        } else {
          successCount++;

          await supabase.from('chat_messages').insert({
            group_id: group.id,
            user_id: member.user_id,
            message: `Auto-contribution of ₦${group.contribution_amount.toLocaleString()} processed`,
            message_type: 'auto_contribution',
          });
          await insertNotification(supabase, member.user_id, 'Contribution Successful', `Your auto-contribution of ₦${group.contribution_amount.toLocaleString()} for ${group.name} was processed successfully.`, 'contribution_success', group.id);
          
          if (result.all_contributed && result.auto_payout?.success) {
            await supabase.from('chat_messages').insert({
              group_id: group.id,
              user_id: member.user_id,
              message: `🎉 Cycle complete! Payout of ₦${result.auto_payout.net_amount?.toLocaleString() || 'N/A'} sent to recipient.`,
              message_type: 'payout_notification',
            });
          }
        }
      }

      const { count: pendingCount } = await supabase
        .from('group_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id)
        .eq('status', 'active')
        .eq('has_contributed_this_cycle', false);

      results.push({
        groupId: group.id,
        groupName: group.name,
        success: true,
        details: `Wallet: ${successCount - cardFallbackCount}, Card fallback: ${cardFallbackCount}, Failed: ${failCount}. Pending: ${pendingCount || 0}`,
      });
    }

    console.log('Auto-contribution job completed:', JSON.stringify(results, null, 2));

    return new Response(JSON.stringify({
      success: true,
      processed_at: now.toISOString(),
      results,
      catchup_results: catchupResults,
      retry_results: retryResults,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Auto-contribution error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});