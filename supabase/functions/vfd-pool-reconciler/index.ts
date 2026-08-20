// VFD Pool Reconciler — compares VFD corporate pool balance against
// the sum of Vestara ledger wallet balances, and per-NUBAN drift.
//
// Triggered by pg_cron on a schedule. Authenticates via CRON_SECRET.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { vfdFetch, getGatewayAccessToken } from "../_shared/vfd-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Confirmed Vestara corporate pool NUBAN.
const PLATFORM_POOL_NUBAN = Deno.env.get("VFD_CORPORATE_POOL_NUBAN") || "1047279595";
// Bills settlement position (funded before every /pay). Reconciled alongside
// the pool so bills float is never invisible.
const BILLS_SETTLEMENT_NUBAN = Deno.env.get("VFD_BILLS_SETTLEMENT_NUBAN") || "";

// Wallet API base — must be the vtech-wallet host (NOT the mandate/directdebit
// base held in VFD_BASE_URL, which has no /account/enquiry endpoint).
const VFD_BASE_URL =
  (Deno.env.get("VFD_MODE") ?? "").toLowerCase() === "production"
    ? "https://api-apps.vfdbank.systems/vtech-wallet/api/v2/wallet2"
    : "https://api-devapps.vfdbank.systems/vtech-wallet/api/v2/wallet2";
const VFD_BEARER = Deno.env.get("VFD_BEARER_TOKEN") ?? "";
const VFD_WALLET_CREDENTIAL_ID =
  Deno.env.get("VFD_WALLET_CREDENTIAL_ID") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function enquiryOnce(accountNumber: string | null): Promise<{
  ok: boolean;
  balance: number | null;
  accountNo: string | null;
  raw: unknown;
}> {
  const url = new URL(`${VFD_BASE_URL}/account/enquiry`);
  if (accountNumber) url.searchParams.set("accountNumber", accountNumber);
  if (VFD_WALLET_CREDENTIAL_ID) url.searchParams.set("wallet-credential-id", VFD_WALLET_CREDENTIAL_ID);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const gatewayToken = await getGatewayAccessToken();
  if (gatewayToken) headers["AccessToken"] = gatewayToken;
  else if (VFD_BEARER) headers["Authorization"] = `Bearer ${VFD_BEARER}`;
  if (VFD_WALLET_CREDENTIAL_ID) headers["wallet-credential-id"] = VFD_WALLET_CREDENTIAL_ID;

  try {
    const res = await vfdFetch(url.toString(), { method: "GET", headers });
    const data = await res.json().catch(() => null);
    const status = (data as { status?: string } | null)?.status;
    const d = (data as { data?: { accountBalance?: string | number; accountNo?: string } } | null)?.data;
    const acctBal = d?.accountBalance;
    const balance = acctBal !== undefined && acctBal !== null ? Number(acctBal) : null;
    return { ok: res.status === 200 && status === "00", balance, accountNo: d?.accountNo ?? null, raw: data };
  } catch (err) {
    console.error("[reconciler] enquiry error", accountNumber, err);
    return { ok: false, balance: null, accountNo: null, raw: { error: String(err) } };
  }
}

// Corporate/pool accounts are not addressable via `?accountNumber=` on the
// wallet credential (VFD answers "Account Not Found" — status 01). The
// credential-scoped self enquiry (no accountNumber) returns the corporate
// account itself, so fall back to that when the explicit lookup misses.
async function vfdAccountEnquiry(accountNumber: string): Promise<{
  ok: boolean;
  balance: number | null;
  raw: unknown;
}> {
  const direct = await enquiryOnce(accountNumber);
  if (direct.ok && direct.balance !== null) return direct;

  const self = await enquiryOnce(null);
  if (self.ok && self.balance !== null && (!self.accountNo || self.accountNo === accountNumber)) {
    return { ok: true, balance: self.balance, raw: { via: "credential_self_enquiry", direct: direct.raw, self: self.raw } };
  }
  return { ok: false, balance: null, raw: { direct: direct.raw, self: self.raw } };
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: cron token stored in internal_cron_tokens (service-role readable only).
  const provided =
    req.headers.get("x-cron-secret") ||
    (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: tokenRow } = await supabase
    .from("internal_cron_tokens")
    .select("token")
    .eq("name", "vfd_pool_reconciler")
    .maybeSingle();
  if (!tokenRow?.token || provided !== tokenRow.token) {
    return json({ success: false, error: "Forbidden" }, 403);
  }


  const body = await req.json().catch(() => ({}));
  const mode = (body.mode as string) || "corporate_pool"; // 'corporate_pool' | 'per_nuban' | 'both'
  const results: Record<string, unknown> = {};

  // ============================================================
  // 1. Corporate pool reconciliation
  // ============================================================
  if (mode === "corporate_pool" || mode === "both") {
    const enquiry = await vfdAccountEnquiry(PLATFORM_POOL_NUBAN);

    // Sum of all user ledger wallet balances (settled/confirmed = the
    // committed balance column on vestara_accounts, which the ledger
    // maintains atomically via double-entry).
    const { data: walletAccts, error: sumErr } = await supabase
      .from("vestara_accounts")
      .select("balance")
      .eq("account_type", "wallet");

    let ledgerSum = 0;
    if (!sumErr && walletAccts) {
      for (const a of walletAccts) ledgerSum += Number(a.balance ?? 0);
    }
    ledgerSum = Math.round(ledgerSum * 100) / 100;

    let status: "matched" | "discrepancy" | "error" = "error";
    let variance: number | null = null;
    let notes = "";

    if (!enquiry.ok || enquiry.balance === null) {
      status = "error";
      notes = "VFD corporate /account/enquiry failed";
    } else {
      variance = Math.round((enquiry.balance - ledgerSum) * 100) / 100;
      status = Math.abs(variance) < 0.01 ? "matched" : "discrepancy";
      if (status === "discrepancy") {
        notes = `Variance ₦${variance.toLocaleString()} between VFD pool and ledger sum`;
      } else {
        notes = "Corporate pool balanced with ledger";
      }
    }

    const { data: runRow } = await supabase
      .from("reconciliation_runs")
      .insert({
        run_type: "corporate_pool",
        vfd_corporate_balance: enquiry.ok ? enquiry.balance : null,
        ledger_sum: ledgerSum,
        variance,
        status,
        notes,
        details: { enquiry_raw: enquiry.raw, account: PLATFORM_POOL_NUBAN, wallet_account_count: walletAccts?.length ?? 0 },
      })
      .select()
      .single();

    // Admin notification on discrepancy or error.
    // Recipients are resolved from the super_admin role (never a hardcoded
    // user_id). Alerts are throttled: if the same admin already has an
    // unread alert of this kind from the last 12h, skip re-notifying —
    // the reconciler runs hourly and would otherwise spam the inbox.
    if (status !== "matched") {
      const alertTitle =
        status === "discrepancy" ? "⚠️ Pool variance detected" : "Pool reconciler error";
      const alertMessage =
        status === "discrepancy"
          ? `Corporate pool ₦${enquiry.balance?.toLocaleString()} vs ledger ₦${ledgerSum.toLocaleString()} — variance ₦${variance?.toLocaleString()}`
          : notes;
      const throttleSince = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");

      for (const a of admins ?? []) {
        const { count: recent } = await supabase
          .from("user_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", a.user_id)
          .eq("notification_type", "reconciliation_alert")
          .eq("title", alertTitle)
          .eq("is_read", false)
          .gte("created_at", throttleSince);

        if ((recent ?? 0) > 0) continue;

        await supabase.from("user_notifications").insert({
          user_id: a.user_id,
          title: alertTitle,
          message: alertMessage,
          notification_type: "reconciliation_alert",
        });
      }
    }

    results.corporate_pool = { status, variance, ledger_sum: ledgerSum, vfd_balance: enquiry.balance, run_id: runRow?.id };

    // Bills settlement position: real bank balance vs the internal
    // bills_hold + settlement ledger accounts.
    if (BILLS_SETTLEMENT_NUBAN) {
      const settleEnq = await vfdAccountEnquiry(BILLS_SETTLEMENT_NUBAN);
      const { data: settleAccts } = await supabase
        .from("vestara_accounts")
        .select("account_type, balance")
        .in("account_type", ["bills_hold", "settlement"]);
      let internalSum = 0;
      for (const a of settleAccts ?? []) internalSum += Number(a.balance ?? 0);
      internalSum = Math.round(internalSum * 100) / 100;
      const settleVariance =
        settleEnq.ok && settleEnq.balance !== null
          ? Math.round((settleEnq.balance - internalSum) * 100) / 100
          : null;
      const settleStatus =
        settleVariance === null ? "error" : Math.abs(settleVariance) < 0.01 ? "matched" : "discrepancy";

      await supabase.from("reconciliation_runs").insert({
        run_type: "bills_settlement",
        vfd_corporate_balance: settleEnq.ok ? settleEnq.balance : null,
        ledger_sum: internalSum,
        variance: settleVariance,
        status: settleStatus,
        notes:
          settleStatus === "matched"
            ? "Bills settlement balanced with internal hold/settlement accounts"
            : settleStatus === "error"
              ? "VFD bills settlement /account/enquiry failed"
              : `Variance ₦${settleVariance} between bills settlement NUBAN and internal accounts`,
        details: { account: BILLS_SETTLEMENT_NUBAN, enquiry_raw: settleEnq.raw },
      });

      results.bills_settlement = {
        status: settleStatus,
        variance: settleVariance,
        internal_sum: internalSum,
        vfd_balance: settleEnq.balance,
      };
    }
  }

  // ============================================================
  // 2. Per-NUBAN drift (daily). For each provisioned user NUBAN:
  //    if VFD shows a positive balance and ledger entries for that
  //    user are absent/lower, flag as missed-webhook candidate.
  // ============================================================
  if (mode === "per_nuban" || mode === "both") {
    const { data: clients } = await supabase
      .from("vfd_sandbox_clients")
      .select("user_id, vfd_account_number")
      .not("vfd_account_number", "is", null);

    const findings: Array<Record<string, unknown>> = [];
    for (const c of clients ?? []) {
      const acctNo = c.vfd_account_number as string;
      if (!acctNo || acctNo.startsWith("9")) continue; // skip virtual NUBANs

      const enquiry = await vfdAccountEnquiry(acctNo);
      if (!enquiry.ok || enquiry.balance === null) continue;

      const { data: walletAcct } = await supabase
        .from("vestara_accounts")
        .select("balance")
        .eq("user_id", c.user_id)
        .eq("account_type", "wallet")
        .maybeSingle();
      const ledgerBal = Number(walletAcct?.balance ?? 0);

      // TRUE drift = live bank balance vs ledger wallet balance.
      // (Previously this recorded `enquiry.balance - 0`, so every funded
      // account was flagged unhealthy every night with drift == balance —
      // pure noise that buried real discrepancies and made alerting useless.)
      const drift = Math.round((enquiry.balance - ledgerBal) * 100) / 100;
      const threshold = 0.01;
      if (Math.abs(drift) > threshold) {
        const finding = {
          user_id: c.user_id,
          vfd_account_number: acctNo,
          vfd_live_balance: enquiry.balance,
          recorded_balance: ledgerBal,
          drift,
          threshold,
          is_healthy: false,
          details: {
            mode: "per_nuban_live_vs_ledger",
            direction: drift > 0 ? "bank_ahead_of_ledger" : "ledger_ahead_of_bank",
            note: drift > 0
              ? "Bank holds more than ledger — possible missed inflow webhook/sweep"
              : "Ledger holds more than bank — possible phantom/duplicate credit",
          },
          resolved: false,
          checked_at: new Date().toISOString(),
        };
        await supabase.from("vfd_balance_drift_findings").insert(finding);
        findings.push(finding);
      }
    }


    await supabase.from("reconciliation_runs").insert({
      run_type: "per_nuban",
      vfd_corporate_balance: null,
      ledger_sum: null,
      variance: findings.length,
      status: findings.length > 0 ? "discrepancy" : "matched",
      notes: findings.length > 0
        ? `${findings.length} NUBAN(s) holding pre-sweep balance — possible missed webhook`
        : "All NUBANs swept/ledgered cleanly",
      details: { findings_count: findings.length, sample: findings.slice(0, 5) },
    });

    results.per_nuban = { flagged: findings.length };
  }

  // ============================================================
  // 3. Targeted live VFD-vs-ledger verification.
  //    Run this immediately after ANY bulk operation, migration or
  //    manual correcting entry — never trust an internal-only recheck.
  //    body: { mode: "verify_users", user_ids: [...] }  (or account_numbers)
  // ============================================================
  if (mode === "verify_users") {
    const userIds = Array.isArray(body.user_ids) ? (body.user_ids as string[]) : [];
    const accountNumbers = Array.isArray(body.account_numbers) ? (body.account_numbers as string[]) : [];
    let query = supabase.from("vfd_sandbox_clients").select("user_id, vfd_account_number");
    if (userIds.length) query = query.in("user_id", userIds);
    else if (accountNumbers.length) query = query.in("vfd_account_number", accountNumbers);
    else return json({ success: false, error: "user_ids or account_numbers required" }, 400);

    const { data: targets } = await query;
    const checks: Array<Record<string, unknown>> = [];
    for (const t of targets ?? []) {
      const acctNo = t.vfd_account_number as string | null;
      if (!acctNo) continue;
      const enquiry = await vfdAccountEnquiry(acctNo);
      const { data: led } = await supabase.rpc("vestara_user_ledger_wallet_balance", { _user_id: t.user_id });
      const ledgerBal = Math.round(Number(led ?? 0) * 100) / 100;
      const live = enquiry.ok && enquiry.balance !== null ? enquiry.balance : null;
      const variance = live === null ? null : Math.round((live - ledgerBal) * 100) / 100;
      const matched = variance !== null && Math.abs(variance) < 0.01;
      checks.push({
        user_id: t.user_id,
        account_number: acctNo,
        vfd_live_balance: live,
        ledger_balance: ledgerBal,
        variance,
        status: live === null ? "error" : matched ? "matched" : "mismatch",
      });
      if (live !== null && !matched) {
        await supabase.from("vfd_balance_drift_findings").insert({
          user_id: t.user_id,
          vfd_account_number: acctNo,
          vfd_live_balance: live,
          recorded_balance: ledgerBal,
          drift: variance,
          threshold: 0.01,
          is_healthy: false,
          details: { mode: "post_operation_verify" },
          resolved: false,
          checked_at: new Date().toISOString(),
        });
      }
    }

    await supabase.from("reconciliation_runs").insert({
      run_type: "post_operation_verify",
      vfd_corporate_balance: null,
      ledger_sum: null,
      variance: checks.filter((c) => c.status === "mismatch").length,
      status: checks.some((c) => c.status !== "matched") ? "discrepancy" : "matched",
      notes: `Live VFD vs ledger verification for ${checks.length} account(s)`,
      details: { checks },
    });

    results.verify_users = checks;
  }

  return json({ success: true, results });
});
