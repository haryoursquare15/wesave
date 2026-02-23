import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Auto-contribution (wallet-only) job started at:', new Date().toISOString());

    // Parse request body for optional force_group_id (for manual testing)
    let forceGroupId: string | null = null;
    try {
      const body = await req.json();
      forceGroupId = body.force_group_id || null;
      
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

    // ---- Catch-up sweep: process groups whose scheduled trigger was missed entirely ----
    const catchupResults: { groupId: string; groupName: string; catchupMembers: number; succeeded: number }[] = [];

    if (!forceGroupId) {
      const { data: allActiveGroupsCatchup } = await supabase
        .from('thrift_groups')
        .select('id, name, contribution_amount, contribution_hour, contribution_minute, period')
        .eq('status', 'active');

      for (const group of allActiveGroupsCatchup || []) {
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

        // Check if ANY contribution audit entries exist for this cycle
        const { count: auditCount } = await supabase
          .from('contribution_audit')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', group.id)
          .eq('cycle_id', activeCycle.id);

        const cycleAge = Date.now() - new Date(activeCycle.created_at).getTime();
        const THIRTY_MINUTES = 30 * 60 * 1000;

        if ((auditCount || 0) > 0 || cycleAge < THIRTY_MINUTES) continue;

        console.log(`CATCH-UP: Group "${group.name}" has active cycle ${activeCycle.cycle_number} with ZERO contribution attempts. Processing now.`);

        let catchupSucceeded = 0;

        for (const member of pendingMembers) {
          // Wallet-only deduction — NO card fallback
          const { data: result, error: rpcError } = await supabase.rpc('process_contribution_ledger_atomic', {
            _user_id: member.user_id,
            _group_id: group.id,
            _amount: group.contribution_amount,
          });

          if (!rpcError && result?.success) {
            catchupSucceeded++;
            // NOTE: contribution_audit is already inserted by process_contribution_ledger_atomic RPC
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
            // Wallet insufficient — mark as failed, NO retry, NO card fallback
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
              message: `⚠️ Auto-contribution failed — insufficient wallet balance. Please fund your wallet and contribute manually.`,
              message_type: 'contribution_failed',
            });
            await insertNotification(supabase, member.user_id, 'Contribution Failed', `Auto-contribution for ${group.name} failed due to insufficient wallet balance. Please fund your wallet to continue saving.`, 'contribution_failed', group.id);
          }
        }

        catchupResults.push({ groupId: group.id, groupName: group.name, catchupMembers: pendingMembers.length, succeeded: catchupSucceeded });
      }

      if (catchupResults.length > 0) {
        console.log('Catch-up sweep results:', JSON.stringify(catchupResults, null, 2));
      }
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

      for (const member of members || []) {
        // Idempotency: check if already processed for this cycle
        const { data: existingContrib } = await supabase
          .from('cycle_contributions')
          .select('id')
          .eq('cycle_id', activeCycle.id)
          .eq('user_id', member.user_id)
          .in('status', ['completed', 'pending'])
          .limit(1);

        if (existingContrib && existingContrib.length > 0) {
          console.log(`Skipping user ${member.user_id} — already has contribution record for this cycle`);
          continue;
        }

        // Wallet-only deduction — NO card fallback
        const { data: result, error: rpcError } = await supabase.rpc('process_contribution_ledger_atomic', {
          _user_id: member.user_id,
          _group_id: group.id,
          _amount: group.contribution_amount,
        });

        if (rpcError || !result?.success) {
          failCount++;
          
          // Only insert audit for failures — successes are handled by the RPC
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
            message: `⚠️ Auto-contribution failed — insufficient wallet balance. Please fund your wallet and contribute manually.`,
            message_type: 'contribution_failed',
          });
          await insertNotification(supabase, member.user_id, 'Contribution Failed', `Auto-contribution for ${group.name} failed due to insufficient wallet balance. Please fund your wallet to continue saving.`, 'contribution_failed', group.id);
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
        details: `Wallet: ${successCount} succeeded, ${failCount} failed, ${pendingCount || 0} still pending`,
      });
    }

    console.log('Auto-contribution results:', JSON.stringify(results, null, 2));

    return new Response(JSON.stringify({
      success: true,
      processed_at: new Date().toISOString(),
      catchup_results: catchupResults,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Auto-contribution error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Something went wrong',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
