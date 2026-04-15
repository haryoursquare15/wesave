import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { action, ...params } = await req.json();
    console.log(`vestara-ledger action: ${action}`);

    // Authenticate user (except for webhook)
    let userId: string | null = null;
    if (action !== "deposit_webhook") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return err("Unauthorized", 401);
      const { data: { user }, error: authErr } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authErr || !user) return err("Unauthorized", 401);
      userId = user.id;
    }

    let result: unknown;

    switch (action) {
      // ── Deposit webhook (VFD) ──
      case "deposit_webhook": {
        const { account_number, amount, reference, metadata } = params;
        if (!account_number || !amount || !reference)
          return err("account_number, amount, and reference are required");

        // Look up user by VFD virtual account (NUBAN)
        const { data: client } = await supabase
          .from("vfd_sandbox_clients")
          .select("user_id")
          .eq("vfd_account_number", account_number)
          .single();

        if (!client) return err("Unknown account number");

        const { data } = await supabase.rpc("vestara_deposit", {
          _user_id: client.user_id,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Get balance ──
      case "get_balance": {
        const { data } = await supabase.rpc("vestara_get_balance", {
          _user_id: userId,
        });
        result = { success: true, accounts: data };
        break;
      }

      // ── Get transactions ──
      case "get_transactions": {
        const { limit = 50, offset = 0 } = params;
        const { data, error: qErr } = await supabase
          .from("vestara_transactions")
          .select("*, vestara_ledger_entries(*)")
          .eq("initiated_by", userId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (qErr) return err(qErr.message);
        result = { success: true, transactions: data };
        break;
      }

      // ── Withdraw ──
      case "withdraw": {
        const { amount, reference, metadata } = params;
        if (!amount || !reference) return err("amount and reference are required");

        const { data } = await supabase.rpc("vestara_withdraw", {
          _user_id: userId,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;

        // If successful, optionally call VFD transfer API here
        if (data?.success) {
          // VFD transfer would go here in production
          console.log(`Withdrawal approved for ${userId}: ₦${amount}`);
        }
        break;
      }

      // ── Lock funds ──
      case "lock_funds": {
        const { amount, duration_months, reference, metadata } = params;
        if (!amount || !duration_months || !reference)
          return err("amount, duration_months, and reference are required");

        const { data } = await supabase.rpc("vestara_lock_funds", {
          _user_id: userId,
          _amount: amount,
          _duration_months: duration_months,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Unlock funds ──
      case "unlock_funds": {
        const { lock_account_id, penalty, reference, metadata } = params;
        if (!lock_account_id) return err("lock_account_id is required");

        const { data } = await supabase.rpc("vestara_unlock_funds", {
          _user_id: userId,
          _lock_account_id: lock_account_id,
          _penalty: penalty || 0,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Thrift contribute ──
      case "thrift_contribute": {
        const { group_id, amount, reference, metadata } = params;
        if (!group_id || !amount || !reference)
          return err("group_id, amount, and reference are required");

        const { data } = await supabase.rpc("vestara_thrift_contribute", {
          _user_id: userId,
          _group_id: group_id,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Thrift payout ──
      case "thrift_payout": {
        const { beneficiary_id, group_id, gross_amount, fee, reference, metadata } = params;
        if (!beneficiary_id || !group_id || !gross_amount)
          return err("beneficiary_id, group_id, and gross_amount are required");

        const { data } = await supabase.rpc("vestara_thrift_payout", {
          _beneficiary_id: beneficiary_id,
          _group_id: group_id,
          _gross_amount: gross_amount,
          _fee: fee || 0,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Split pay ──
      case "split_pay": {
        const { split_id, amount, reference, metadata } = params;
        if (!split_id || !amount || !reference)
          return err("split_id, amount, and reference are required");

        const { data } = await supabase.rpc("vestara_split_pay", {
          _user_id: userId,
          _split_id: split_id,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Split distribute ──
      case "split_distribute": {
        const { split_id, recipients, reference, metadata } = params;
        if (!split_id || !recipients || !reference)
          return err("split_id, recipients, and reference are required");

        const { data } = await supabase.rpc("vestara_split_distribute", {
          _split_id: split_id,
          _recipients: recipients,
          _reference: reference,
          _initiated_by: userId,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Crowdfund contribute ──
      case "crowdfund_contribute": {
        const { campaign_id, amount, reference, metadata } = params;
        if (!campaign_id || !amount || !reference)
          return err("campaign_id, amount, and reference are required");

        const { data } = await supabase.rpc("vestara_crowdfund_contribute", {
          _user_id: userId,
          _campaign_id: campaign_id,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Crowdfund disburse ──
      case "crowdfund_disburse": {
        const { beneficiary_id, campaign_id, amount, reference, metadata } = params;
        if (!beneficiary_id || !campaign_id || !amount)
          return err("beneficiary_id, campaign_id, and amount are required");

        const { data } = await supabase.rpc("vestara_crowdfund_disburse", {
          _beneficiary_id: beneficiary_id,
          _campaign_id: campaign_id,
          _amount: amount,
          _reference: reference || `cf-disburse-${crypto.randomUUID()}`,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Accrue interest (admin/cron only) ──
      case "accrue_interest": {
        const { target_user_id, amount, reference, metadata } = params;
        if (!target_user_id || !amount || !reference)
          return err("target_user_id, amount, and reference are required");

        const { data } = await supabase.rpc("vestara_accrue_interest", {
          _user_id: target_user_id,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Payout interest ──
      case "payout_interest": {
        const { amount, reference, metadata } = params;
        if (!amount || !reference) return err("amount and reference are required");

        const { data } = await supabase.rpc("vestara_payout_interest", {
          _user_id: userId,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Get accounts (all user accounts) ──
      case "get_accounts": {
        const { data, error: qErr } = await supabase
          .from("vestara_accounts")
          .select("*")
          .eq("user_id", userId);
        if (qErr) return err(qErr.message);
        result = { success: true, accounts: data };
        break;
      }

      default:
        return err(`Unknown action: ${action}`);
    }

    return ok(result);
  } catch (error: unknown) {
    console.error("vestara-ledger error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return err(msg, 500);
  }
});
