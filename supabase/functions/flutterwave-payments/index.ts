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

const ACTION_ROUTES: Record<string, string> = {
  'fund_wallet': 'wallet-operations',
  'verify_transaction': 'wallet-operations',
  'exit_group': 'group-actions',
  'restart_group': 'group-actions',
  'confirm_continue': 'group-actions',
  'initiate_contribution': 'contribution-handler',
  'process_payout': 'contribution-handler',
};

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    
    console.log(`Routing action: ${action}`);

    const targetFunction = ACTION_ROUTES[action];
    if (!targetFunction) throw new Error(`Unknown action: ${action}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    
    const { data, error } = await supabase.functions.invoke(targetFunction, {
      body: body,
      headers: authHeader ? { Authorization: authHeader } : undefined,
    });

    if (error) throw new Error(error.message || 'Failed to process request');

    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Router error:', error);
    return new Response(JSON.stringify({ success: false, error: 'An error occurred' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
