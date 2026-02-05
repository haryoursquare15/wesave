import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Auto-contribution job started at:', new Date().toISOString());

    // Parse request body for optional force_group_id (for manual testing)
    let forceGroupId: string | null = null;
    try {
      const body = await req.json();
      forceGroupId = body.force_group_id || null;
      if (forceGroupId) {
        console.log(`Manual trigger requested for group: ${forceGroupId}`);
      }
    } catch {
      // No body or invalid JSON - that's fine for scheduled calls
    }

    // Get current time in West African Time (WAT = UTC+1)
    const now = new Date();
    const watOffset = 1; // WAT is UTC+1
    const watHour = (now.getUTCHours() + watOffset) % 24;
    const watMinute = now.getUTCMinutes();
    // Round to nearest 30-minute slot (0 or 30)
    const currentMinuteSlot = watMinute < 30 ? 0 : 30;
    
    // Adjust day if hour overflow crosses midnight
    let watDate = new Date(now);
    if (now.getUTCHours() + watOffset >= 24) {
      watDate.setUTCDate(watDate.getUTCDate() + 1);
    }
    const currentDayOfWeek = watDate.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentDayOfMonth = watDate.getUTCDate();

    console.log(`Current WAT (Nigerian) time: Hour=${watHour}, Minute=${currentMinuteSlot}, DayOfWeek=${currentDayOfWeek}, DayOfMonth=${currentDayOfMonth}`);

    let dueGroups;
    let groupsError;

    // If force_group_id is provided, process that specific group regardless of schedule
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
      console.log(`Force processing group: ${forceGroupId}, found: ${dueGroups?.length || 0}`);
    } else {
      // Normal scheduled flow - find active groups that are due for contribution
      // Match hour AND minute (with null/0 minute treated as :00)
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
      // Skip schedule checks if force_group_id is provided
      if (!forceGroupId) {
        // Check if the minute matches (null or 0 = :00, 30 = :30)
        const groupMinute = group.contribution_minute ?? 0;
        if (groupMinute !== currentMinuteSlot) {
          console.log(`Skipping group ${group.name}: Minute mismatch (group=${groupMinute}, current=${currentMinuteSlot})`);
          continue;
        }

        // Check if the contribution is due based on period
        let isDue = false;

        if (group.period === 'daily') {
          isDue = true;
        } else if (group.period === 'weekly') {
          isDue = group.contribution_day_of_week === currentDayOfWeek;
        } else if (group.period === 'monthly') {
          isDue = group.contribution_day_of_month === currentDayOfMonth;
        }

        if (!isDue) {
          console.log(`Skipping group ${group.name}: Not due (period=${group.period}, dayOfWeek=${group.contribution_day_of_week}, dayOfMonth=${group.contribution_day_of_month})`);
          continue;
        }
      } else {
        console.log(`Force processing group ${group.name} - skipping schedule checks`);
      }

      console.log(`Processing auto-contribution for group: ${group.name} (${group.id})`);

      // Get active cycle for this group
      const { data: activeCycle } = await supabase
        .from('contribution_cycles')
        .select('id')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .single();

      if (!activeCycle) {
        console.log(`No active cycle for group ${group.name}, skipping`);
        results.push({
          groupId: group.id,
          groupName: group.name,
          success: false,
          details: 'No active cycle',
        });
        continue;
      }

      // Get all active members who haven't contributed this cycle
      const { data: members, error: membersError } = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .eq('has_contributed_this_cycle', false);

      if (membersError) {
        console.error(`Error fetching members for group ${group.name}:`, membersError);
        results.push({
          groupId: group.id,
          groupName: group.name,
          success: false,
          details: `Error fetching members: ${membersError.message}`,
        });
        continue;
      }

      console.log(`Found ${members?.length || 0} members who haven't contributed in group ${group.name}`);

      let successCount = 0;
      let failCount = 0;

      for (const member of members || []) {
        // Process contribution atomically - this now auto-triggers payout when all contribute
        const { data: result, error: rpcError } = await supabase.rpc('process_contribution_atomic', {
          _user_id: member.user_id,
          _group_id: group.id,
          _amount: group.contribution_amount,
        });

        if (rpcError) {
          console.error(`Auto-contribution failed for user ${member.user_id}:`, rpcError);
          failCount++;
          
          // Log failed auto-contribution
          await supabase.from('contribution_audit').insert({
            user_id: member.user_id,
            group_id: group.id,
            cycle_id: activeCycle.id,
            amount: group.contribution_amount,
            contribution_type: 'auto',
            status: 'failed',
          });
        } else if (!result.success) {
          console.error(`Auto-contribution rejected for user ${member.user_id}:`, result.error);
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
          console.log(`Auto-contribution successful for user ${member.user_id}`);
          successCount++;

          // Add system message to chat
          await supabase.from('chat_messages').insert({
            group_id: group.id,
            user_id: member.user_id,
            message: `Auto-contribution of ₦${group.contribution_amount.toLocaleString()} processed`,
            message_type: 'auto_contribution',
          });
          
          // Check if auto-payout was triggered (all contributed)
          if (result.all_contributed && result.auto_payout?.success) {
            console.log(`Auto-payout triggered for group ${group.name}:`, result.auto_payout);
            
            // Send notification about successful payout
            await supabase.from('chat_messages').insert({
              group_id: group.id,
              user_id: member.user_id,
              message: `🎉 Cycle complete! Payout of ₦${result.auto_payout.net_amount?.toLocaleString() || 'N/A'} sent to recipient.`,
              message_type: 'payout_notification',
            });
          }
        }
      }

      // Check if all contributions are complete
      const { count: pendingCount } = await supabase
        .from('group_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id)
        .eq('status', 'active')
        .eq('has_contributed_this_cycle', false);

      const allContributed = (pendingCount || 0) === 0;

      results.push({
        groupId: group.id,
        groupName: group.name,
        success: true,
        details: `Processed ${successCount} contributions, ${failCount} failed. All contributed: ${allContributed}. Auto-payout is now integrated into contribution flow.`,
      });
    }

    console.log('Auto-contribution job completed:', JSON.stringify(results, null, 2));

    return new Response(JSON.stringify({
      success: true,
      processed_at: now.toISOString(),
      results,
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
