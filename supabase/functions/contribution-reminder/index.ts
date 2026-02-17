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

    console.log('Contribution reminder job started at:', new Date().toISOString());

    // Get all active groups with an active cycle
    const { data: activeGroups, error: groupsError } = await supabase
      .from('thrift_groups')
      .select('id, name, contribution_amount, period, current_cycle')
      .eq('status', 'active');

    if (groupsError) {
      console.error('Error fetching active groups:', groupsError);
      throw groupsError;
    }

    const results: { groupId: string; groupName: string; pendingMembers: number; notified: number }[] = [];

    for (const group of activeGroups || []) {
      // Check for active cycle
      const { data: activeCycle } = await supabase
        .from('contribution_cycles')
        .select('id, cycle_number')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .single();

      if (!activeCycle) continue;

      // Get members who have NOT contributed this cycle
      const { data: pendingMembers, error: membersError } = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .eq('has_contributed_this_cycle', false);

      if (membersError || !pendingMembers || pendingMembers.length === 0) continue;

      // Get usernames for pending members
      const pendingUserIds = pendingMembers.map(m => m.user_id);
      const { data: profiles } = await supabase
        .rpc('get_public_profiles', { user_ids: pendingUserIds });

      const profileMap = new Map(
        (profiles || []).map((p: { id: string; username: string | null; full_name: string | null }) => [p.id, p])
      );

      let notifiedCount = 0;

      for (const member of pendingMembers) {
        const profile = profileMap.get(member.user_id);
        const displayName = profile?.username
          ? `@${profile.username}`
          : profile?.full_name || 'A member';

        // Check if we already sent a reminder in the last 12 hours for this cycle
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
        const { data: existingReminder } = await supabase
          .from('chat_messages')
          .select('id')
          .eq('group_id', group.id)
          .eq('user_id', member.user_id)
          .eq('message_type', 'contribution_reminder')
          .gte('created_at', twelveHoursAgo)
          .limit(1);

        if (existingReminder && existingReminder.length > 0) {
          continue; // Already reminded recently
        }

        // Post reminder to group chat notifying others
        await supabase.from('chat_messages').insert({
          group_id: group.id,
          user_id: member.user_id,
          message: `⏰ ${displayName} has not yet contributed ₦${group.contribution_amount.toLocaleString()} for Cycle ${activeCycle.cycle_number}. Please make your contribution.`,
          message_type: 'contribution_reminder',
        });

        notifiedCount++;
      }

      if (notifiedCount > 0) {
        results.push({
          groupId: group.id,
          groupName: group.name,
          pendingMembers: pendingMembers.length,
          notified: notifiedCount,
        });
      }
    }

    console.log('Contribution reminder job completed:', JSON.stringify(results, null, 2));

    return new Response(JSON.stringify({
      success: true,
      processed_at: new Date().toISOString(),
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Contribution reminder error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Something went wrong. Please try again later.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
