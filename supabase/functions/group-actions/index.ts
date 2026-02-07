import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Unauthorized');

    const { action, ...params } = await req.json();
    console.log(`Group action: ${action} for user: ${user.id}`);

    let result;

    switch (action) {
      case 'exit_group': {
        const { groupId } = params;
        if (!groupId) throw new Error('Group ID is required');

        const { data: userProfile } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single();
        const { data: exitResult, error: rpcError } = await supabase.rpc('exit_completed_group', { _group_id: groupId });

        if (rpcError) throw new Error('Failed to exit group');
        if (!exitResult.success) throw new Error(exitResult.error || 'Failed to exit group');

        const displayName = userProfile?.username ? `@${userProfile.username}` : userProfile?.full_name || 'A member';
        await supabase.from('chat_messages').insert({ group_id: groupId, user_id: user.id, message: `${displayName} has exited the group`, message_type: 'system' });

        result = exitResult;
        break;
      }

      case 'restart_group': {
        const { groupId, termsAccepted } = params;
        if (!groupId) throw new Error('Group ID is required');
        if (!termsAccepted) throw new Error('You must accept the terms and conditions');

        const { data: adminProfile } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single();
        const { data: restartResult, error: rpcError } = await supabase.rpc('restart_completed_group', { _group_id: groupId });

        if (rpcError) throw new Error('Failed to restart group');
        if (!restartResult.success) throw new Error(restartResult.error || 'Failed to restart group');

        const adminName = adminProfile?.username ? `@${adminProfile.username}` : adminProfile?.full_name || 'The admin';
        await supabase.from('chat_messages').insert({ group_id: groupId, user_id: user.id, message: `${adminName} has restarted the group. A new cycle has begun!`, message_type: 'system' });

        result = restartResult;
        break;
      }

      case 'confirm_continue': {
        const { groupId } = params;
        if (!groupId) throw new Error('Group ID is required');

        const { data: confirmResult, error: rpcError } = await supabase.rpc('confirm_continue_group', { _group_id: groupId });
        if (rpcError) throw new Error('Failed to confirm continuation');
        if (!confirmResult.success) throw new Error(confirmResult.error || 'Failed to confirm continuation');

        result = confirmResult;
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Group action error:', error);
    let userMessage = 'An error occurred';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('unauthorized')) userMessage = 'Authentication required';
      else if (msg.includes('terms')) userMessage = 'You must accept the terms and conditions';
      else if (msg.includes('only admin')) userMessage = 'Only the group admin can perform this action';
      else if (msg.includes('not member')) userMessage = 'You are not a member of this group';
      else if (msg.includes('not completed')) userMessage = 'This action is only available for completed groups';
      else userMessage = error.message;
    }
    return new Response(JSON.stringify({ success: false, error: userMessage }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
