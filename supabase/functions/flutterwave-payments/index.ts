import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-nonce, x-request-timestamp',
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

// Financial actions that require replay protection
const FINANCIAL_ACTIONS = new Set([
  'fund_wallet', 'withdraw_to_bank', 'initiate_contribution', 'process_payout',
]);

// Rate limits per action category (requests per minute)
const RATE_LIMITS: Record<string, number> = {
  'fund_wallet': 5,
  'withdraw_to_bank': 3,
  'initiate_contribution': 5,
  'process_payout': 3,
  'validate_bank_account': 10,
  'verify_transaction': 15,
  'exit_group': 5,
  'restart_group': 3,
  'confirm_continue': 5,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;
    
    console.log(`Routing action: ${action}`);

    const targetFunction = ACTION_ROUTES[action];
    if (!targetFunction) throw new Error(`Unknown action: ${action}`);

    // --- RATE LIMITING ---
    // Use IP + action as identifier for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('cf-connecting-ip') 
      || 'unknown';
    const authHeader = req.headers.get('Authorization');
    const rateLimitId = authHeader 
      ? `user:${authHeader.slice(-16)}:${action}` // Last 16 chars of token as user identifier
      : `ip:${clientIp}:${action}`;
    
    const maxRequests = RATE_LIMITS[action] || 30;
    const { data: rateLimitResult } = await supabase.rpc('check_rate_limit', {
      _identifier: rateLimitId,
      _endpoint: action,
      _max_requests: maxRequests,
      _window_seconds: 60,
    });

    if (rateLimitResult && !rateLimitResult.allowed) {
      console.warn(`Rate limited: ${rateLimitId} (${rateLimitResult.count}/${maxRequests})`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Too many requests. Please wait a moment and try again.' 
      }), { 
        status: 429, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': '60',
        } 
      });
    }

    // --- REPLAY PROTECTION for financial actions ---
    if (FINANCIAL_ACTIONS.has(action)) {
      const nonce = req.headers.get('x-request-nonce');
      const timestamp = req.headers.get('x-request-timestamp');

      // Validate timestamp (reject requests older than 5 minutes)
      if (timestamp) {
        const requestTime = parseInt(timestamp, 10);
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes
        
        if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAge) {
          console.warn(`Request timestamp too old or invalid: ${timestamp}`);
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Request expired. Please try again.' 
          }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
      }

      // Validate nonce (prevent replay)
      if (nonce) {
        const { data: nonceValid } = await supabase.rpc('consume_nonce', {
          _nonce: nonce,
          _endpoint: action,
        });

        if (nonceValid === false) {
          console.warn(`Replayed nonce detected: ${nonce} for ${action}`);
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Duplicate request detected. This transaction may have already been processed.' 
          }), { 
            status: 409, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
      }
    }

    // --- FORWARD REQUEST ---
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
