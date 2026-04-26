import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// deno-lint-ignore no-explicit-any
async function insertNotification(
  supabase: any,
  userId: string,
  title: string,
  message: string,
  notificationType: string
) {
  try {
    await supabase.from('user_notifications').insert({
      user_id: userId,
      title,
      message,
      notification_type: notificationType,
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
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(supabaseUrl, supabaseServiceKey);

    console.log('Target Ajo auto-contribution sweep started at:', new Date().toISOString());

    // Get current WAT time
    const now = new Date();
    const watOffset = 1;
    const watHour = (now.getUTCHours() + watOffset) % 24;

    let watDate = new Date(now);
    if (now.getUTCHours() + watOffset >= 24) {
      watDate.setUTCDate(watDate.getUTCDate() + 1);
    }
    const currentDayOfWeek = watDate.getUTCDay();
    const currentDayOfMonth = watDate.getUTCDate();

    console.log(`WAT: Hour=${watHour}, DayOfWeek=${currentDayOfWeek}, DayOfMonth=${currentDayOfMonth}`);

    // Only run at 16:00 WAT (same default as regular ajo)
    // For cron running every hour, we check if it's the right hour
    const TARGET_HOUR = 16;
    if (watHour !== TARGET_HOUR) {
      console.log(`Not contribution hour (current=${watHour}, target=${TARGET_HOUR}). Skipping.`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Not contribution hour' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all active target ajo groups
    const { data: groups, error: groupsError } = await supabase
      .from('target_ajo_groups')
      .select('id, name, contribution_amount, frequency, target_amount, amount_raised, max_members')
      .eq('status', 'active');

    if (groupsError) {
      console.error('Error fetching target ajo groups:', groupsError);
      throw groupsError;
    }

    console.log(`Found ${groups?.length || 0} active Target Ajo groups`);

    const results: { groupId: string; groupName: string; success: boolean; details: string }[] = [];

    for (const group of groups || []) {
      // Check if group is due based on frequency
      let isDue = false;
      if (group.frequency === 'daily') {
        isDue = true;
      } else if (group.frequency === 'weekly') {
        // Weekly on Monday (day 1)
        isDue = currentDayOfWeek === 1;
      } else if (group.frequency === 'monthly') {
        // Monthly on the 1st
        isDue = currentDayOfMonth === 1;
      }

      if (!isDue) continue;

      // Skip if target already reached
      if (group.amount_raised >= group.target_amount) {
        console.log(`Skipping "${group.name}" — target already reached`);
        continue;
      }

      console.log(`Processing Target Ajo: "${group.name}" (${group.id})`);

      // Get active members
      const { data: members, error: membersError } = await supabase
        .from('target_ajo_memberships')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('status', 'active');

      if (membersError || !members?.length) {
        results.push({ groupId: group.id, groupName: group.name, success: false, details: membersError?.message || 'No members' });
        continue;
      }

      // Idempotency: check today's contributions to avoid double-processing
      const todayStart = new Date(watDate);
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(watDate);
      todayEnd.setUTCHours(23, 59, 59, 999);

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (const member of members) {
        // Check if already contributed today (idempotency)
        const { data: existingToday } = await supabase
          .from('target_ajo_contributions')
          .select('id')
          .eq('group_id', group.id)
          .eq('user_id', member.user_id)
          .eq('source', 'auto_wallet')
          .gte('created_at', todayStart.toISOString())
          .lte('created_at', todayEnd.toISOString())
          .limit(1);

        if (existingToday && existingToday.length > 0) {
          skippedCount++;
          continue;
        }

        // Call the atomic RPC
        const { data: result, error: rpcError } = await supabase.rpc('process_target_ajo_contribution', {
          _group_id: group.id,
          _user_id: member.user_id,
          _amount: group.contribution_amount,
        });

        if (rpcError || !result?.success) {
          failCount++;
          const reason = result?.error || rpcError?.message || 'Unknown error';
          console.log(`Failed for user ${member.user_id}: ${reason}`);

          await insertNotification(
            supabase,
            member.user_id,
            'Target Ajo Contribution Failed',
            `Auto-contribution of ₦${group.contribution_amount.toLocaleString()} for "${group.name}" failed: ${reason}. Please fund your wallet.`,
            'contribution_failed'
          );
        } else {
          successCount++;

          // Update the source to 'auto_wallet' for the contribution we just created
          await supabase
            .from('target_ajo_contributions')
            .update({ source: 'auto_wallet' })
            .eq('reference', result.tx_ref);

          await insertNotification(
            supabase,
            member.user_id,
            'Target Ajo Contribution',
            `Auto-contribution of ₦${group.contribution_amount.toLocaleString()} for "${group.name}" was successful.`,
            'contribution_success'
          );

          if (result.target_reached) {
            // Notify all members that target was reached
            for (const m of members) {
              await insertNotification(
                supabase,
                m.user_id,
                '🎯 Target Achieved!',
                `"${group.name}" has reached its savings target! Funds will be distributed to members.`,
                'target_achieved'
              );
            }
            break; // Stop processing more members for this group
          }
        }
      }

      results.push({
        groupId: group.id,
        groupName: group.name,
        success: true,
        details: `${successCount} succeeded, ${failCount} failed, ${skippedCount} skipped`,
      });
    }

    console.log('Target Ajo auto-contribution results:', JSON.stringify(results, null, 2));

    return new Response(JSON.stringify({
      success: true,
      processed_at: new Date().toISOString(),
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Target Ajo auto-contribution error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Something went wrong',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
