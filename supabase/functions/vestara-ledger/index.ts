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

// ── Webhook signature verification (HMAC-SHA256) ──
async function verifyWebhookSignature(req: Request, body: string): Promise<boolean> {
  const webhookSecret = Deno.env.get("VFD_WEBHOOK_SECRET");
  // Hard-fail when the signing secret is not configured — refusing to
  // process webhooks is much safer than blindly accepting them.
  if (!webhookSecret) {
    console.error("[vestara-ledger] VFD_WEBHOOK_SECRET not configured — rejecting webhook");
    return false;
  }
  const signature = req.headers.get("x-vfd-signature") || req.headers.get("x-webhook-signature");
  if (!signature) {
    console.error("[vestara-ledger] Missing webhook signature header");
    return false;
  }
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const macBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
    const expected = Array.from(macBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    // Constant-time compare
    const provided = signature.toLowerCase().replace(/^sha256=/, "");
    if (expected.length !== provided.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    console.error("[vestara-ledger] HMAC verification error:", e);
    return false;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function getSettlementSnapshot(supabase: ReturnType<typeof createClient>, userId: string) {
  const [{ data: walletAccount }, { data: settlementAccount }] = await Promise.all([
    supabase
      .from("vestara_accounts")
      .select("balance")
      .eq("user_id", userId)
      .eq("account_type", "wallet")
      .maybeSingle(),
    supabase
      .from("vestara_accounts")
      .select("balance")
      .eq("is_system", true)
      .eq("account_type", "settlement")
      .maybeSingle(),
  ]);

  return {
    walletBalance: toNumber(walletAccount?.balance),
    settlementBalance: toNumber(settlementAccount?.balance),
  };
}

async function syncBalanceCachesFromVestara(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: accounts, error } = await supabase
    .from("vestara_accounts")
    .select("account_type, balance")
    .eq("user_id", userId);

  if (error) {
    console.error("[vestara-ledger] balance cache sync read failed:", error);
    return null;
  }

  const wallet = (accounts ?? [])
    .filter((a) => a.account_type === "wallet")
    .reduce((sum, a) => sum + toNumber(a.balance), 0);
  const locked = (accounts ?? [])
    .filter((a) => a.account_type === "locked_savings")
    .reduce((sum, a) => sum + toNumber(a.balance), 0);
  const savings = (accounts ?? [])
    .filter((a) => a.account_type === "accrued_interest")
    .reduce((sum, a) => sum + toNumber(a.balance), 0);
  const timestamp = new Date().toISOString();

  await supabase.from("wallets").upsert(
    { user_id: userId, available_balance: wallet, locked_balance: locked, updated_at: timestamp },
    { onConflict: "user_id" },
  );

  await supabase.from("vfd_user_balances").upsert(
    {
      user_id: userId,
      total_balance: wallet + locked + savings,
      available_balance: wallet,
      locked_balance: locked,
      savings_balance: savings,
      last_synced_at: timestamp,
      updated_at: timestamp,
    },
    { onConflict: "user_id" },
  );

  return { wallet, locked, savings, total: wallet + locked + savings };
}

async function logSettlementAudit(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { error } = await supabase.from("vestara_settlement_balance_audit").insert(payload);
  if (error) console.error("[vestara-ledger] settlement audit insert failed:", error);
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

    // Cron-only actions (system jobs) — require CRON_SECRET in either the
    // Authorization Bearer header or the x-cron-secret header. Refuse the
    // request if the secret is not configured at all.
    const cronActions = [
      "accrue_interest_batch", "reconcile",
      "accrue_daily_interest", "auto_mature_due", "run_savings_reconciliation",
    ];
    const isCronAction = cronActions.includes(action);
    if (isCronAction) {
      const cronSecret = Deno.env.get("CRON_SECRET");
      if (!cronSecret) return err("Server cron secret not configured", 503);
      const provided =
        req.headers.get("x-cron-secret") ||
        (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (provided !== cronSecret) return err("Forbidden", 403);
    }

    // Authenticate user (except for webhook and cron actions)
    let userId: string | null = null;
    const noAuthActions = [
      "deposit_webhook", ...cronActions,
    ];
    if (!noAuthActions.includes(action)) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return err("Unauthorized", 401);
      const { data: { user }, error: authErr } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authErr || !user) return err("Unauthorized", 401);
      userId = user.id;
    }

    // Caller-context helpers for high-privilege actions
    async function requireSuperAdmin(uid: string): Promise<boolean> {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .in("role", ["super_admin", "admin"])
        .maybeSingle();
      return !!data;
    }
    async function callerIsCronOrAdmin(): Promise<boolean> {
      const cronSecret = Deno.env.get("CRON_SECRET");
      const provided =
        req.headers.get("x-cron-secret") ||
        (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (cronSecret && provided === cronSecret) return true;
      if (!userId) return false;
      return await requireSuperAdmin(userId);
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
          if (!(await verifyWebhookSignature(req, rawBody))) {
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

        const before = await getSettlementSnapshot(supabase, targetUserId);
        const { data } = await supabase.rpc("vestara_deposit", {
          _user_id: targetUserId,
          _amount: amount,
          _reference: reference,
          _metadata: metadata || {},
        });
        const depositResult = data as { success?: boolean; transaction_id?: string } | null;
        if (depositResult?.success) {
          const after = await getSettlementSnapshot(supabase, targetUserId);
          await syncBalanceCachesFromVestara(supabase, targetUserId);
          await logSettlementAudit(supabase, {
            user_id: targetUserId,
            account_number: account_number === "__self__" ? null : account_number,
            event_type: "deposit_settlement_credit",
            reference,
            vestara_transaction_id: depositResult.transaction_id ?? null,
            amount,
            wallet_balance_before: before.walletBalance,
            wallet_balance_after: after.walletBalance,
            settlement_balance_before: before.settlementBalance,
            settlement_balance_after: after.settlementBalance,
            legacy_wallet_balance_after: after.walletBalance,
            metadata: metadata || {},
          });
        }
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
        if ((data as { success?: boolean } | null)?.success) {
          await syncBalanceCachesFromVestara(supabase, userId!);
        }
        result = data;
        break;
      }

      // ── Transfer complete/fail ──
      case "transfer_complete": {
        const { original_reference, success: transferSuccess, metadata } = params;
        if (!original_reference) return err("original_reference is required");

        const { data: originalTx } = await supabase
          .from("vestara_transactions")
          .select("amount")
          .eq("reference", original_reference)
          .eq("type", "transfer")
          .maybeSingle();
        const completingSuccess = transferSuccess ?? true;
        const before = await getSettlementSnapshot(supabase, userId!);
        const { data } = await supabase.rpc("vestara_transfer_complete", {
          _user_id: userId,
          _original_reference: original_reference,
          _success: completingSuccess,
          _metadata: metadata || {},
        });
        const completeResult = data as { success?: boolean; transaction_id?: string } | null;
        if (completeResult?.success) {
          const after = await getSettlementSnapshot(supabase, userId!);
          await syncBalanceCachesFromVestara(supabase, userId!);
          await logSettlementAudit(supabase, {
            user_id: userId,
            event_type: completingSuccess ? "transfer_settlement_complete" : "transfer_settlement_reversal",
            reference: `${original_reference}-${completingSuccess ? "complete" : "refund"}`,
            vestara_transaction_id: completeResult.transaction_id ?? null,
            amount: toNumber(originalTx?.amount),
            wallet_balance_before: before.walletBalance,
            wallet_balance_after: after.walletBalance,
            settlement_balance_before: before.settlementBalance,
            settlement_balance_after: after.settlementBalance,
            legacy_wallet_balance_after: after.walletBalance,
            metadata: { ...(metadata || {}), original_reference },
          });
        }
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

        // Authorization: only the group admin or a platform super_admin can
        // trigger a thrift payout from the group's pool.
        const { data: group } = await supabase
          .from("thrift_groups")
          .select("admin_id")
          .eq("id", group_id)
          .maybeSingle();
        const isOwner = !!group && group.admin_id === userId;
        if (!isOwner && !(await requireSuperAdmin(userId!))) {
          return err("Only the group admin or a platform admin can run thrift payouts", 403);
        }

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

        // Authorization: only the campaign creator or a platform super_admin
        // can disburse a campaign's pooled funds.
        const { data: campaign } = await supabase
          .from("crowdfunding_campaigns")
          .select("creator_id")
          .eq("id", campaign_id)
          .maybeSingle();
        const isOwner = !!campaign && campaign.creator_id === userId;
        if (!isOwner && !(await requireSuperAdmin(userId!))) {
          return err("Only the campaign creator or a platform admin can disburse this campaign", 403);
        }

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

        // Authorization: cron jobs OR super_admin only — never end-users.
        if (!(await callerIsCronOrAdmin())) {
          return err("Forbidden", 403);
        }

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

        // Authorization: super_admin / admin only — reversing a posted
        // ledger entry must never be triggerable by an end user.
        if (!(await requireSuperAdmin(userId!))) {
          return err("Forbidden", 403);
        }

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

      // ─────────── Vestara Savings Products ───────────
      case "list_products": {
        const { data, error: e } = await supabase
          .from("vestara_products")
          .select("*")
          .eq("is_active", true)
          .order("code");
        if (e) return err(e.message);
        result = { success: true, products: data };
        break;
      }

      case "list_savings": {
        const { data, error: e } = await supabase
          .from("vestara_savings")
          .select("*, vestara_products(code,name,description,allow_early_withdrawal,early_withdrawal_penalty_pct,is_upfront_yield)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (e) return err(e.message);
        result = { success: true, savings: data };
        break;
      }

      case "create_savings": {
        const { product_code, principal, tenor_days, reference } = params;
        if (!product_code || !principal || !tenor_days) {
          return err("product_code, principal, and tenor_days are required");
        }
        const ref = reference || `sav-${crypto.randomUUID().slice(0, 8)}`;
        const { data, error: e } = await supabase.rpc("vestara_create_savings", {
          _user_id: userId,
          _product_code: product_code,
          _principal: principal,
          _tenor_days: tenor_days,
          _reference: ref,
        });
        if (e) return err(e.message);
        result = data;
        break;
      }

      case "mature_savings": {
        const { savings_id } = params;
        if (!savings_id) return err("savings_id is required");
        const { data, error: e } = await supabase.rpc("vestara_mature_savings", {
          _savings_id: savings_id,
        });
        if (e) return err(e.message);
        result = data;
        break;
      }

      case "early_withdraw_savings": {
        const { savings_id } = params;
        if (!savings_id) return err("savings_id is required");
        const { data, error: e } = await supabase.rpc(
          "vestara_early_withdraw_savings",
          { _user_id: userId, _savings_id: savings_id }
        );
        if (e) return err(e.message);
        result = data;
        break;
      }

      // ─────────── Cron jobs ───────────
      case "accrue_daily_interest": {
        const { data, error: e } = await supabase.rpc("vestara_accrue_daily_interest");
        if (e) return err(e.message);
        result = data;
        break;
      }

      case "auto_mature_due": {
        const { data, error: e } = await supabase.rpc("vestara_auto_mature_due");
        if (e) return err(e.message);
        result = data;
        break;
      }

      case "run_savings_reconciliation": {
        const { data, error: e } = await supabase.rpc("vestara_run_reconciliation");
        if (e) return err(e.message);
        result = data;
        break;
      }

      // ─────────── Admin ───────────
      case "get_treasury": {
        // verify admin
        const { data: roles } = await supabase
          .from("user_roles").select("role").eq("user_id", userId);
        const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
        if (!isAdmin) return err("Admin only", 403);
        const { data: t } = await supabase.from("vestara_treasury").select("*").limit(1).maybeSingle();
        const { data: findings } = await supabase
          .from("vestara_reconciliation_findings")
          .select("*").order("checked_at", { ascending: false }).limit(20);
        result = { success: true, treasury: t, recent_findings: findings };
        break;
      }

      case "admin_update_product": {
        const { product_id, updates } = params;
        if (!product_id || !updates) return err("product_id and updates required");
        const { data: roles } = await supabase
          .from("user_roles").select("role").eq("user_id", userId);
        const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
        if (!isAdmin) return err("Admin only", 403);
        const { data, error: e } = await supabase
          .from("vestara_products").update(updates).eq("id", product_id).select().single();
        if (e) return err(e.message);
        result = { success: true, product: data };
        break;
      }

      // ─────────── Goal Savings 2.0 (commitment + DDM) ───────────
      case "goalsave_v2_quote": {
        const amount = Number(params.amount);
        const frequency = String(params.frequency || "");
        const tenor_count = Number(params.tenor_count);
        if (!Number.isFinite(amount) || amount < 1000) return err("Minimum contribution is ₦1,000");
        if (!["weekly", "monthly"].includes(frequency)) return err("frequency must be weekly or monthly");
        if (!Number.isFinite(tenor_count) || tenor_count < 1) return err("Invalid tenor");
        if (frequency === "weekly" && tenor_count < 4) return err("Weekly plans need at least 4 weeks");

        const { data: cfg } = await supabase
          .from("vestara_rate_configs")
          .select("user_rate,vfd_rate")
          .eq("product_code", "goalsave")
          .eq("is_active", true)
          .eq("frequency", frequency)
          .order("priority", { ascending: false })
          .limit(1)
          .maybeSingle();
        const rate = Number(cfg?.user_rate || 12);

        const start = new Date();
        const schedule: { seq: number; scheduled_at: string; amount: number }[] = [];
        for (let i = 0; i < tenor_count; i++) {
          const d = new Date(start);
          if (frequency === "weekly") d.setDate(d.getDate() + (i + 1) * 7);
          else d.setMonth(d.getMonth() + (i + 1));
          schedule.push({ seq: i + 1, scheduled_at: d.toISOString(), amount });
        }
        const maturity = new Date(schedule[schedule.length - 1].scheduled_at);
        const tenor_days = Math.max(1, Math.round((maturity.getTime() - start.getTime()) / 86400000));
        const total_contrib = amount * tenor_count;

        // Interest accrues per installment on remaining time to maturity (simple-interest approx)
        let projected_interest = 0;
        for (const s of schedule) {
          const remainingDays = Math.max(0, (maturity.getTime() - new Date(s.scheduled_at).getTime()) / 86400000);
          projected_interest += s.amount * (rate / 100) * (remainingDays / 365);
        }
        projected_interest = Math.round(projected_interest * 100) / 100;

        const mandate_fee = Number(Deno.env.get("VFD_MANDATE_FEE") || "100");
        result = {
          success: true,
          rate,
          frequency,
          tenor_count,
          tenor_days,
          contribution_amount: amount,
          total_contributions: total_contrib,
          projected_interest,
          projected_maturity_value: Math.round((total_contrib + projected_interest) * 100) / 100,
          maturity_date: maturity.toISOString(),
          start_date: start.toISOString(),
          mandate_fee,
          schedule,
        };
        break;
      }

      case "goalsave_v2_create": {
        const {
          amount, frequency, tenor_count,
          goal_name, goal_purpose,
        } = params as Record<string, unknown>;
        const amt = Number(amount), tc = Number(tenor_count), fq = String(frequency || "");
        if (!Number.isFinite(amt) || amt < 1000) return err("Minimum contribution is ₦1,000");
        if (!["weekly", "monthly"].includes(fq)) return err("frequency must be weekly or monthly");
        if (!Number.isFinite(tc) || tc < 1) return err("Invalid tenor");
        if (fq === "weekly" && tc < 4) return err("Weekly plans need at least 4 weeks");
        if (!goal_name || typeof goal_name !== "string") return err("goal_name is required");

        // Re-quote server-side (don't trust client)
        const { data: cfg } = await supabase
          .from("vestara_rate_configs").select("user_rate,vfd_rate")
          .eq("product_code", "goalsave").eq("is_active", true).eq("frequency", fq)
          .order("priority", { ascending: false }).limit(1).maybeSingle();
        const userRate = Number(cfg?.user_rate || 12);
        const vfdRate = Number(cfg?.vfd_rate || 14);

        const start = new Date();
        const sched: { seq: number; scheduled_at: string; amount: number }[] = [];
        for (let i = 0; i < tc; i++) {
          const d = new Date(start);
          if (fq === "weekly") d.setDate(d.getDate() + (i + 1) * 7);
          else d.setMonth(d.getMonth() + (i + 1));
          sched.push({ seq: i + 1, scheduled_at: d.toISOString(), amount: amt });
        }
        const maturity = new Date(sched[sched.length - 1].scheduled_at);
        const tenor_days = Math.max(1, Math.round((maturity.getTime() - start.getTime()) / 86400000));

        // Fetch product + ensure lock account
        const { data: product } = await supabase
          .from("vestara_products").select("id").eq("code", "goalsave").maybeSingle();
        if (!product?.id) return err("Goal Savings product is not configured");

        let { data: lockAcc } = await supabase
          .from("vestara_accounts").select("id")
          .eq("user_id", userId!).eq("account_type", "locked_savings").maybeSingle();
        if (!lockAcc) {
          const { data: newAcc, error: aErr } = await supabase
            .from("vestara_accounts")
            .insert({ user_id: userId!, account_type: "locked_savings", balance: 0, currency: "NGN", metadata: { product_code: "goalsave" } })
            .select("id").single();
          if (aErr) return err(aErr.message);
          lockAcc = newAcc;
        }

        const mandate_fee = Number(Deno.env.get("VFD_MANDATE_FEE") || "100");

        const { data: savings, error: sErr } = await supabase.from("vestara_savings").insert({
          user_id: userId!,
          product_id: product.id,
          product_code: "goalsave",
          lock_account_id: lockAcc!.id,
          principal: 0,
          original_principal: 0,
          user_rate: userRate,
          vfd_rate: vfdRate,
          tenor_days,
          start_date: start.toISOString(),
          maturity_date: maturity.toISOString(),
          status: "active",
          commitment_frequency: fq,
          commitment_amount: amt,
          tenor_count: tc,
          next_debit_at: sched[0].scheduled_at,
          mandate_status: "pending",
          mandate_fee,
          activation_status: "pending_mandate",
          metadata: { goal_name, goal_purpose: goal_purpose ?? null, v2: true },
        }).select().single();
        if (sErr) return err(sErr.message);

        const rows = sched.map(s => ({
          savings_id: savings.id,
          user_id: userId!,
          seq: s.seq,
          scheduled_at: s.scheduled_at,
          amount: s.amount,
          status: "scheduled",
        }));
        const { error: schErr } = await supabase.from("vfd_savings_debit_schedule").insert(rows);
        if (schErr) {
          // rollback savings row
          await supabase.from("vestara_savings").delete().eq("id", savings.id);
          return err(schErr.message);
        }

        result = { success: true, savings_id: savings.id, mandate_fee, maturity_date: maturity.toISOString() };
        break;
      }

      case "goalsave_v2_authorize_mandate":
      case "goalsave_v2_retry_mandate": {
        const savings_id = String((params as Record<string, unknown>).savings_id || "");
        const fee_consent = Boolean((params as Record<string, unknown>).fee_consent);
        if (!savings_id) return err("savings_id is required");
        if (!fee_consent) return err("Mandate fee consent is required");

        const { data: s, error: gErr } = await supabase
          .from("vestara_savings").select("*").eq("id", savings_id).maybeSingle();
        if (gErr || !s) return err("Savings plan not found");
        if (s.user_id !== userId) return err("Not authorized", 403);
        if (s.activation_status === "active") return err("Mandate already active");

        const fee = Number(s.mandate_fee || 0);
        // Per-investment fee reference, so the platform fee ledger lines up
        // with the goal savings plan it belongs to.
        const feeRef = `VES-MND-FEE-${savings_id}-${Date.now()}`;
        if (fee > 0) {
          const { error: wErr } = await supabase.rpc("vestara_withdraw", {
            _user_id: userId,
            _amount: fee,
            _reference: feeRef,
            _metadata: {
              source: "goalsave_mandate_setup_fee",
              product_code: "goalsave",
              savings_id,
            },
          });
          if (wErr) return err(`Insufficient wallet balance for mandate fee (₦${fee})`);
          await supabase.from("vestara_fee_ledger").insert({
            user_id: userId,
            fee_type: "goalsave_mandate_setup",
            amount: fee,
            reference: feeRef,
            tx_reference: feeRef,
            metadata: { savings_id, product_code: "goalsave" },
          });
        }

        // ─── Call VFD Direct Debit Mandate API ───
        // Endpoint: https://api-devapps.vfdbank.systems/vtech-mandate/api/v2/directdebit
        let mandateId = "";
        let mandateStatus: "authorized" | "pending" | "failed" = "pending";
        let activationStatus: "active" | "pending_mandate" | "failed" = "pending_mandate";
        let vfdResponsePayload: Record<string, unknown> = {};

        try {
          const VFD_MANDATE_URL = "https://api-devapps.vfdbank.systems/vtech-mandate/api/v2/directdebit";
          // Pull VFD access token via same creds used by vfd-banking
          const consumerKey = Deno.env.get("VFD_CONSUMER_KEY");
          const consumerSecret = Deno.env.get("VFD_CONSUMER_SECRET");
          const staticToken = Deno.env.get("VFD_ACCESS_TOKEN");
          let accessToken = staticToken || "";
          if (consumerKey && consumerSecret) {
            const tokRes = await fetch(
              "https://api-devapps.vfdbank.systems/vfd-tech/baas-portal/v1.1/baasauth/token",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "-1" }),
              },
            );
            const tokData = await tokRes.json().catch(() => ({}));
            if (tokData?.data?.access_token) accessToken = tokData.data.access_token;
          }
          if (!accessToken) throw new Error("VFD credentials not configured");

          // Fetch the user's VFD account for the mandate (debtor side)
          const { data: client } = await supabase
            .from("vfd_sandbox_clients")
            .select("vfd_account_number, bvn, first_name, last_name, phone_number")
            .eq("user_id", userId!)
            .maybeSingle();

          const startDate = new Date().toISOString().split("T")[0];
          const endDate = String(s.maturity_date).split("T")[0];

          const mandatePayload = {
            accountNo: client?.vfd_account_number || "",
            productCode: "GOALSAVE",
            mandateCode: `VST-MND-${savings_id.slice(0, 12)}`,
            amount: fee || s.commitment_amount,
            frequency: String(s.commitment_frequency || "").toUpperCase(),
            startDate,
            endDate,
            narration: `Vestara Goal Savings mandate ${savings_id.slice(0, 8)}`,
            payerName: [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "Vestara Customer",
            payerPhone: client?.phone_number || "",
            reference: `VST-MND-${savings_id}`,
          };

          const ddmRes = await fetch(VFD_MANDATE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", AccessToken: accessToken },
            body: JSON.stringify(mandatePayload),
          });
          const ddmJson = await ddmRes.json().catch(() => ({}));
          vfdResponsePayload = { request: mandatePayload, response: ddmJson, http_status: ddmRes.status };

          const okStatus = ddmJson?.status === "00" || ddmRes.ok;
          if (okStatus) {
            mandateId = String(
              ddmJson?.data?.mandateId ||
              ddmJson?.data?.mandateCode ||
              ddmJson?.data?.reference ||
              mandatePayload.mandateCode,
            );
            mandateStatus = "authorized";
            activationStatus = "active";
          } else {
            mandateStatus = "failed";
            activationStatus = "pending_mandate";
          }
        } catch (e) {
          vfdResponsePayload = { error: e instanceof Error ? e.message : String(e) };
          mandateStatus = "failed";
          activationStatus = "pending_mandate";
        }

        const { error: uErr } = await supabase.from("vestara_savings").update({
          mandate_id: mandateId || null,
          mandate_status: mandateStatus,
          activation_status: activationStatus,
        }).eq("id", savings_id);
        if (uErr) return err(uErr.message);

        await supabase.from("vfd_savings_mandate_events").insert({
          savings_id, user_id: userId!, mandate_id: mandateId || null,
          event_type: mandateStatus,
          payload: { charged_fee: fee, fee_reference: feeRef, vfd: vfdResponsePayload },
        });

        if (mandateStatus !== "authorized") {
          return err("Mandate authorization failed at VFD. Your fee was charged; please retry.");
        }

        result = { success: true, mandate_id: mandateId, mandate_status: mandateStatus, activation_status: activationStatus };
        break;
      }

      case "goalsave_v2_get_schedule": {
        const savings_id = String((params as Record<string, unknown>).savings_id || "");
        if (!savings_id) return err("savings_id is required");
        const { data, error: e } = await supabase
          .from("vfd_savings_debit_schedule").select("*")
          .eq("savings_id", savings_id).order("seq", { ascending: true });
        if (e) return err(e.message);
        result = { success: true, schedule: data };
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
