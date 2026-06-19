import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://thrift-harmony-hub.lovable.app',
  'https://id-preview--52f5b582-a468-4659-81c8-2245803e62d4.lovable.app',
  'https://wesave.lovable.app',
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.lovableproject.com')) return true;
  if (origin.endsWith('.lovable.app')) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
  };
}

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const FLUTTERWAVE_SECRET_KEY = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    const PLATFORM_BANK_ACCOUNT = Deno.env.get('PLATFORM_BANK_ACCOUNT');
    const PLATFORM_BANK_CODE = Deno.env.get('PLATFORM_BANK_CODE') || '044';
    
    if (!FLUTTERWAVE_SECRET_KEY) {
      throw new Error('FLUTTERWAVE_SECRET_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Helper function to check admin access
    const checkAdminAccess = async () => {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        throw new Error('Authentication required');
      }
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      if (!user) {
        throw new Error('Invalid authentication');
      }
      const { data: isAdmin } = await supabase.rpc('is_any_admin', { _user_id: user.id });
      if (!isAdmin) {
        throw new Error('Admin access required');
      }
      return user;
    };

    const body = await req.json();
    const { action, ...params } = body;
    console.log(`Platform settlement action: ${action}`);

    let result;

    switch (action) {
      case 'get_platform_balance': {
        await checkAdminAccess();

        const { data: wallet, error } = await supabase
          .from('platform_wallet')
          .select('*')
          .eq('wallet_type', 'revenue')
          .single();

        if (error) throw error;

        result = {
          success: true,
          available_balance: wallet.available_balance,
          pending_balance: wallet.pending_balance,
          total_collected: wallet.total_collected,
          last_settlement_at: wallet.last_settlement_at,
        };
        break;
      }

      case 'get_platform_ledger': {
        await checkAdminAccess();

        const { limit = 50, offset = 0 } = params;

        const { data: entries, error } = await supabase
          .from('platform_ledger')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        result = { success: true, entries: entries || [] };
        break;
      }

      case 'auto_settle': {
        // Always require authentication: either an admin user session OR a
        // server-side cron secret. The previous logic skipped the admin
        // check entirely when no Authorization header was present, which
        // allowed any unauthenticated caller to trigger a real settlement.
        const cronSecret = Deno.env.get('CRON_SECRET');
        const providedCronSecret = req.headers.get('x-cron-secret') || body?.cron_secret;
        const isCron = !!cronSecret && providedCronSecret === cronSecret;
        if (!isCron) {
          await checkAdminAccess();
        }


        if (!PLATFORM_BANK_ACCOUNT) {
          console.log('Platform bank account not configured, skipping settlement');
          result = { success: false, error: 'Platform bank account not configured' };
          break;
        }

        const { data: wallet, error: walletError } = await supabase
          .from('platform_wallet')
          .select('*')
          .eq('wallet_type', 'revenue')
          .single();

        if (walletError || !wallet) {
          throw new Error('Failed to fetch platform wallet');
        }

        const settleAmount = wallet.available_balance;

        if (settleAmount < 1000) {
          console.log(`Settlement skipped: balance too low (₦${settleAmount})`);
          result = {
            success: true,
            skipped: true,
            reason: 'Balance below minimum settlement threshold (₦1000)',
            current_balance: settleAmount,
          };
          break;
        }

        const transferRef = `settle-${Date.now()}`;

        const { data: settlement, error: insertError } = await supabase
          .from('platform_settlements')
          .insert({
            amount: settleAmount,
            status: 'processing',
            bank_account: PLATFORM_BANK_ACCOUNT.slice(-4),
            bank_name: 'Access Bank',
            flw_transfer_ref: transferRef,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        try {
          const transferResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/transfers`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              account_bank: PLATFORM_BANK_CODE,
              account_number: PLATFORM_BANK_ACCOUNT,
              amount: settleAmount,
              currency: 'NGN',
              narration: `WeSave platform settlement - ${transferRef}`,
              reference: transferRef,
              debit_currency: 'NGN',
            }),
          });

          const transferData = await transferResponse.json();
          console.log('Settlement transfer response:', JSON.stringify(transferData));

          if (transferData.status === 'success') {
            const newBalance = 0;
            
            await supabase
              .from('platform_ledger')
              .insert({
                entry_type: 'settlement',
                amount: settleAmount,
                balance_before: wallet.available_balance,
                balance_after: newBalance,
                settlement_reference: transferRef,
                description: `Auto-settlement to platform bank account`,
              });

            await supabase
              .from('platform_wallet')
              .update({
                available_balance: newBalance,
                last_settlement_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('wallet_type', 'revenue');

            await supabase
              .from('platform_settlements')
              .update({
                status: 'completed',
                flw_transfer_id: transferData.data?.id?.toString(),
                completed_at: new Date().toISOString(),
              })
              .eq('id', settlement.id);

            result = {
              success: true,
              amount: settleAmount,
              reference: transferRef,
              message: `Successfully settled ₦${settleAmount.toLocaleString()} to platform account`,
            };
          } else {
            await supabase
              .from('platform_settlements')
              .update({
                status: 'failed',
                failure_reason: transferData.message || 'Transfer failed',
              })
              .eq('id', settlement.id);

            throw new Error(transferData.message || 'Settlement transfer failed');
          }
        } catch (transferError) {
          console.error('Settlement transfer error:', transferError);
          
          await supabase
            .from('platform_settlements')
            .update({
              status: 'failed',
              failure_reason: transferError instanceof Error ? transferError.message : 'Unknown error',
            })
            .eq('id', settlement.id);

          throw transferError;
        }
        break;
      }

      case 'get_settlement_history': {
        await checkAdminAccess();

        const { limit = 50 } = params;

        const { data: settlements, error } = await supabase
          .from('platform_settlements')
          .select('*')
          .order('initiated_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        result = { success: true, settlements: settlements || [] };
        break;
      }

      case 'get_fee_report': {
        await checkAdminAccess();

        const { start_date, end_date } = params;

        let query = supabase
          .from('platform_ledger')
          .select('*')
          .eq('entry_type', 'fee_collected');

        if (start_date) {
          query = query.gte('created_at', start_date);
        }
        if (end_date) {
          query = query.lte('created_at', end_date);
        }

        const { data: entries, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        const totalFees = entries?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
        const feeCount = entries?.length || 0;

        let payoutQuery = supabase
          .from('payouts')
          .select('gross_amount')
          .eq('status', 'completed');

        if (start_date) {
          payoutQuery = payoutQuery.gte('created_at', start_date);
        }
        if (end_date) {
          payoutQuery = payoutQuery.lte('created_at', end_date);
        }

        const { data: payouts } = await payoutQuery;
        const totalPayoutVolume = payouts?.reduce((sum, p) => sum + Number(p.gross_amount), 0) || 0;

        let settlementQuery = supabase
          .from('platform_settlements')
          .select('amount')
          .eq('status', 'completed');

        if (start_date) {
          settlementQuery = settlementQuery.gte('initiated_at', start_date);
        }
        if (end_date) {
          settlementQuery = settlementQuery.lte('initiated_at', end_date);
        }

        const { data: settlements } = await settlementQuery;
        const totalSettled = settlements?.reduce((sum, s) => sum + Number(s.amount), 0) || 0;

        result = {
          success: true,
          report: {
            total_fees_collected: totalFees,
            fee_count: feeCount,
            total_payout_volume: totalPayoutVolume,
            total_settled: totalSettled,
            unsettled_balance: totalFees - totalSettled,
            effective_rate: totalPayoutVolume > 0 ? ((totalFees / totalPayoutVolume) * 100).toFixed(2) + '%' : '0%',
          },
          entries: entries?.slice(0, 100) || [],
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Settlement error:', error);
    
    let userMessage = 'An error occurred';
    if (error instanceof Error) {
      userMessage = error.message;
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: userMessage 
    }), {
      status: 400,
      headers: { ...getCorsHeaders(null), 'Content-Type': 'application/json' },
    });
  }
});
