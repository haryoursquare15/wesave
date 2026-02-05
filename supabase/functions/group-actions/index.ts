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

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
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
    }
    return new Response(JSON.stringify({ success: false, error: userMessage }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
