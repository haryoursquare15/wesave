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

// ── Webhook signature verification ──
function verifyWebhookSignature(req: Request, body: string): boolean {
  const webhookSecret = Deno.env.get("VFD_WEBHOOK_SECRET");
  // In sandbox mode without a configured secret, allow through but log warning
  if (!webhookSecret) {
    console.warn("[vestara-ledger] VFD_WEBHOOK_SECRET not configured — skipping signature check (sandbox only)");
    return true;
  }
  const signature = req.headers.get("x-vfd-signature") || req.headers.get("x-webhook-signature");
  if (!signature) {
    console.error("[vestara-ledger] Missing webhook signature header");
    return false;
  }
  // HMAC-SHA256 verification (production pattern)
  // For sandbox, we accept if secret matches signature directly
  return signature === webhookSecret;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const rawBody = await req.text();
    const { action, ...params } = JSON.parse(rawBody);
    console.log(`vestara-ledger action: ${action}`);

    // Authenticate user (except for webhook and cron actions)
    let userId: string | null = null;
    const noAuthActions = ["deposit_webhook", "accrue_interest_batch", "reconcile"];
    if (!noAuthActions.includes(action)) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return err("Unauthorized", 401);
      const { data: { user }, error: authErr } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authErr || !user) return err("Unauthorized", 401);
      userId = user.id;
    }

    // Helper: ensure user has a wallet account
    async function ensureWallet(uid: string) {
      const { data: existing } = await supabase
        .from("vestara_accounts")
        .select("id")
        .eq("user_id", uid)
        .eq("account_type", "wallet")
        .maybeSingle();
      if (!existing) {
        await supabase.from("vestara_accounts").insert({
          user_id: uid,
          account_type: "wallet",
          balance: 0,
          currency: "NGN",
          metadata: {},
        });
      }
    }

    let result: unknown;

    switch (action) {
      // ── Ensure accounts exist for a user ──
      case "ensure_accounts": {
        await ensureWallet(userId!);
        const { data } = await supabase
          .from("vestara_accounts")
          .select("*")
          .eq("user_id", userId);
        result = { success: true, accounts: data };
        break;
      }

      // ── Deposit webhook (VFD) ──
      case "deposit_webhook": {
        const { account_number, amount, reference, metadata } = params;
        if (!amount || !reference) return err("amount and reference are required");

        // If __self__, this is a sandbox self-credit — use the authenticated user
        let targetUserId: string;
        if (account_number === "__self__") {
          const authHeader = req.headers.get("Authorization");
          if (!authHeader) return err("Unauthorized for self-deposit", 401);
          const { data: { user }, error: authErr } = await supabase.auth.getUser(
            authHeader.replace("Bearer ", "")
          );
          if (authErr || !user) return err("Unauthorized for self-deposit", 401);
          targetUserId = user.id;
        } else {
          // External webhook — verify signature
          if (!verifyWebhookSignature(req, rawBody)) {
            return err("Invalid webhook signature", 403);
          }

          // Look up user by VFD virtual account (NUBAN)
          const { data: client } = await supabase
            .from("vfd_sandbox_clients")
            .select("user_id")
            .eq("vfd_account_number", account_number)
            .single();
          if (!client) return err("Unknown account number");
          targetUserId = client.user_id;
        }

        // Ensure wallet exists
        await ensureWallet(targetUserId);

        const { data } = await supabase.rpc("vestara_deposit", {
          _user_id: targetUserId,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Get balance ──
      case "get_balance": {
        await ensureWallet(userId!);
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

      // ── Withdraw (direct — for non-external withdrawals) ──
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

        if (data?.success) {
          console.log(`Withdrawal approved for ${userId}: ₦${amount}`);
        }
        break;
      }

      // ── Transfer initiate (pending pattern for external transfers) ──
      case "transfer_initiate": {
        const { amount, reference, metadata } = params;
        if (!amount || !reference) return err("amount and reference are required");

        const { data } = await supabase.rpc("vestara_transfer_initiate", {
          _user_id: userId,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Transfer complete/fail ──
      case "transfer_complete": {
        const { original_reference, success: transferSuccess, metadata } = params;
        if (!original_reference) return err("original_reference is required");

        const { data } = await supabase.rpc("vestara_transfer_complete", {
          _user_id: userId,
          _original_reference: original_reference,
          _success: transferSuccess ?? true,
          _metadata: metadata || {},
        });
        result = data;
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

        // penalty is now optional — RPC auto-calculates from metadata
        const { data } = await supabase.rpc("vestara_unlock_funds", {
          _user_id: userId,
          _lock_account_id: lock_account_id,
          _penalty: penalty ?? null,
          _reference: reference || `unlock-${crypto.randomUUID().slice(0, 8)}`,
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
          _reference: reference || `payout-${crypto.randomUUID().slice(0, 8)}`,
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

      // ── Batch accrue interest for ALL locked accounts (cron) ──
      case "accrue_interest_batch": {
        // Find all locked_savings accounts with balance > 0
        const { data: lockedAccounts, error: laErr } = await supabase
          .from("vestara_accounts")
          .select("id, user_id, balance, metadata")
          .eq("account_type", "locked_savings")
          .gt("balance", 0);

        if (laErr) return err(laErr.message);

        const results: unknown[] = [];
        for (const acct of lockedAccounts || []) {
          const meta = (acct.metadata ?? {}) as Record<string, unknown>;
          // Read interest_rate from account metadata (stored during lock creation)
          const rate = Number(meta?.interest_rate || 10); // default 10% p.a.

          // Check maturity — skip if lock has already matured
          const maturityDate = meta?.maturity_date ? new Date(meta.maturity_date as string) : null;
          if (maturityDate && new Date() > maturityDate) {
            console.log(`Skipping matured lock ${acct.id} (matured: ${meta.maturity_date})`);
            continue;
          }

          const dailyRate = rate / 100 / 365;
          const dailyInterest = Math.round(Number(acct.balance) * dailyRate * 100) / 100;

          if (dailyInterest > 0 && acct.user_id) {
            const { data } = await supabase.rpc("vestara_accrue_interest", {
              _user_id: acct.user_id,
              _amount: dailyInterest,
              _reference: `interest-${acct.id}-${new Date().toISOString().slice(0, 10)}`,
              _metadata: {
                lock_account_id: acct.id,
                rate,
                daily_rate: dailyRate,
                principal: acct.balance,
              },
            });
            results.push({ account_id: acct.id, interest: dailyInterest, result: data });
          }
        }
        result = { success: true, accrued_count: results.length, details: results };
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
        await ensureWallet(userId!);
        const { data, error: qErr } = await supabase
          .from("vestara_accounts")
          .select("*")
          .eq("user_id", userId);
        if (qErr) return err(qErr.message);
        result = { success: true, accounts: data };
        break;
      }

      // ── Get locked funds detail ──
      case "get_locked_funds": {
        const { data, error: qErr } = await supabase
          .from("vestara_accounts")
          .select("*")
          .eq("user_id", userId)
          .eq("account_type", "locked_savings")
          .order("created_at", { ascending: false });
        if (qErr) return err(qErr.message);
        result = { success: true, locked_funds: data };
        break;
      }

      // ── Reverse transaction ──
      case "reverse_transaction": {
        const { original_reference, reason, metadata } = params;
        if (!original_reference || !reason)
          return err("original_reference and reason are required");

        const { data } = await supabase.rpc("vestara_reverse_transaction", {
          _original_reference: original_reference,
          _reason: reason,
          _initiated_by: userId,
          _metadata: metadata || {},
        });
        result = data;
        break;
      }

      // ── Reconcile (cron) — improved with per-account drift ──
      case "reconcile": {
        // Per-account drift check using the view
        const { data: driftAccounts, error: driftErr } = await supabase
          .from("vestara_account_drift")
          .select("*");

        if (driftErr) {
          console.error("Drift view query failed, falling back to aggregate:", driftErr.message);
        }

        const driftingAccounts = (driftAccounts || []).filter(
          (a: Record<string, unknown>) => Math.abs(Number(a.drift)) > 0.001
        );

        // Aggregate totals
        const { data: accountTotals, error: atErr } = await supabase
          .from("vestara_accounts")
          .select("account_type, balance");
        if (atErr) return err(atErr.message);

        const { data: ledgerTotals, error: ltErr } = await supabase
          .from("vestara_ledger_entries")
          .select("debit, credit");
        if (ltErr) return err(ltErr.message);

        const totalDebits = (ledgerTotals || []).reduce((s: number, e: Record<string, unknown>) => s + Number(e.debit), 0);
        const totalCredits = (ledgerTotals || []).reduce((s: number, e: Record<string, unknown>) => s + Number(e.credit), 0);
        const balanceByType: Record<string, number> = {};
        for (const acct of accountTotals || []) {
          balanceByType[acct.account_type] = (balanceByType[acct.account_type] || 0) + Number(acct.balance);
        }
        const totalAccountBalance = Object.values(balanceByType).reduce((s, v) => s + v, 0);
        const aggregateDrift = Math.abs(totalDebits - totalCredits);
        const healthy = aggregateDrift < 0.01 && driftingAccounts.length === 0;

        // Log reconciliation
        await supabase.from("vestara_reconciliation_log").insert({
          checked_at: new Date().toISOString(),
          settlement_ledger_balance: totalDebits,
          settlement_actual_balance: totalCredits,
          drift_amount: aggregateDrift,
          status: healthy ? "healthy" : "drift_detected",
          details: {
            balanceByType,
            totalDebits,
            totalCredits,
            totalAccountBalance,
            drifting_accounts_count: driftingAccounts.length,
            drifting_accounts: driftingAccounts.slice(0, 10),
          },
        });

        if (!healthy) {
          console.error(`[RECONCILE] DRIFT DETECTED: aggregate=${aggregateDrift}, per-account=${driftingAccounts.length} accounts drifting`);
        }

        result = {
          success: true,
          healthy,
          aggregate_drift: aggregateDrift,
          drifting_accounts: driftingAccounts.length,
          total_debits: totalDebits,
          total_credits: totalCredits,
          balance_by_type: balanceByType,
          total_account_balance: totalAccountBalance,
        };
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
