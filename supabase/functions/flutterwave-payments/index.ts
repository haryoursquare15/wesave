import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ACTION_ROUTES: Record<string, string> = {
  'fund_wallet': 'wallet-operations',
  'verify_transaction': 'wallet-operations',
  'withdraw_to_bank': 'wallet-operations',
  'validate_bank_account': 'wallet-operations',
  'exit_group': 'group-actions',
  'restart_group': 'group-actions',
  'confirm_continue': 'group-actions',
  'initiate_contribution': 'contribution-handler',
  'process_payout': 'contribution-handler',
};

serve(async (req) => {
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

    const authHeader = req.headers.get('Authorization');
    
    // Use direct fetch to preserve the response status and body
    const targetUrl = `${supabaseUrl}/functions/v1/${targetFunction}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
    };
    
    // Forward the user's auth token if present
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const responseData = await response.text();
    
    // Forward the response status and body as-is
    return new Response(responseData, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Router error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
