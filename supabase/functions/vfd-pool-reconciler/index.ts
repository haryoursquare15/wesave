// VFD Pool Reconciler — compares VFD corporate pool balance against
// the sum of Vestara ledger wallet balances, and per-NUBAN drift.
//
// Triggered by pg_cron on a schedule. Authenticates via CRON_SECRET.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const PLATFORM_POOL_NUBAN = "1001695610";

const VFD_BASE_URL =
  Deno.env.get("VFD_BASE_URL") ?? "https://api-devapps.vfdbank.systems/vtech-wallet/api/v1/wallet2";
const VFD_BEARER = Deno.env.get("VFD_BEARER_TOKEN") ?? "";
const VFD_WALLET_CREDENTIAL_ID =
  Deno.env.get("VFD_WALLET_CREDENTIAL_ID") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function vfdAccountEnquiry(accountNumber: string): Promise<{
  ok: boolean;
  balance: number | null;
  raw: unknown;
}> {
  const url = new URL(`${VFD_BASE_URL}/account/enquiry`);
  url.searchParams.set("accountNumber", accountNumber);
  if (VFD_WALLET_CREDENTIAL_ID) url.searchParams.set("wallet-credential-id", VFD_WALLET_CREDENTIAL_ID);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (VFD_BEARER) headers["Authorization"] = `Bearer ${VFD_BEARER}`;
  if (VFD_WALLET_CREDENTIAL_ID) headers["wallet-credential-id"] = VFD_WALLET_CREDENTIAL_ID;

  try {
    const res = await fetch(url.toString(), { method: "GET", headers });
    const data = await res.json().catch(() => null);
    const status = (data as { status?: string } | null)?.status;
    const acctBal = (data as { data?: { accountBalance?: string | number } } | null)?.data?.accountBalance;
    const balance = acctBal !== undefined && acctBal !== null ? Number(acctBal) : null;
    return { ok: res.status === 200 && status === "00", balance, raw: data };
  } catch (err) {
    console.error("[reconciler] enquiry error", accountNumber, err);
    return { ok: false, balance: null, raw: { error: String(err) } };
  }
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

    // Admin notification on discrepancy or error
    if (status !== "matched") {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");
      for (const a of admins ?? []) {
        await supabase.from("user_notifications").insert({
          user_id: a.user_id,
          title: status === "discrepancy" ? "⚠️ Pool variance detected" : "Pool reconciler error",
          message:
            status === "discrepancy"
              ? `Corporate pool ₦${enquiry.balance?.toLocaleString()} vs ledger ₦${ledgerSum.toLocaleString()} — variance ₦${variance?.toLocaleString()}`
              : notes,
          notification_type: "reconciliation_alert",
        });
      }
    }

    results.corporate_pool = { status, variance, ledger_sum: ledgerSum, vfd_balance: enquiry.balance, run_id: runRow?.id };
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

      const drift = Math.round((enquiry.balance - 0) * 100) / 100;
      // Flag only when VFD has a non-zero balance NOT yet swept/ledgered.
      // Under POOL model, VFD balance should be ~0 (swept). If positive,
      // an inflow may have arrived without webhook → ledger.
      if (enquiry.balance > 0.01) {
        const finding = {
          user_id: c.user_id,
          vfd_account_number: acctNo,
          vfd_live_balance: enquiry.balance,
          recorded_balance: ledgerBal,
          drift,
          threshold: 0.01,
          is_healthy: false,
          details: { mode: "per_nuban_pre_sweep", note: "VFD sub-account holds balance — possible missed sweep/webhook" },
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

  return json({ success: true, results });
});
