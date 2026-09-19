// VFD Fee Sweep — moves Vestara's ALREADY-EARNED fee revenue out of the
// customer sub-accounts where the cash physically landed and into the
// corporate pool NUBAN, via a real, independently verified VFD intra transfer.
//
// This function performs NO accounting. The revenue account was credited at
// the moment each fee was charged (bills convenience fee, transfer fee, stamp
// duty, Split Pay service fee, mandate setup fee, early-withdrawal penalty).
// The sweep only relocates cash so the recognised revenue is backed by money
// actually sitting in the pool.
//
// Safety rails:
//  * Sweep amount is capped at the raw drift (live sub-account balance minus
//    the customer's ledger wallet balance) so a customer's OWN money can never
//    be swept.
//  * Deterministic per-user-per-day reference under a UNIQUE index is the
//    idempotency lock: a duplicate run collides and skips.
//  * A transfer counts only when VFD's own /transactions record confirms it.
//
// Auth: cron token (x-cron-token) or an admin JWT.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { vfdFetch, getGatewayAccessToken } from "../_shared/vfd-gateway.ts";
import { verifyCronToken, requireAdminJwt, unauthorized } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token",
};

const POOL_NUBAN = Deno.env.get("VFD_CORPORATE_POOL_NUBAN") || "1047279595";
const SWEEP_THRESHOLD = Number(Deno.env.get("VFD_FEE_SWEEP_THRESHOLD") || "50");
// Accounts deliberately excluded until their float is explained.
const SKIP_ACCOUNTS = (Deno.env.get("VFD_FEE_SWEEP_SKIP_ACCOUNTS") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function getWalletBase(): string {
  const mode = (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase();
  return mode === "production" || mode === "live"
    ? "https://api-apps.vfdbank.systems/vtech-wallet/api/v2/wallet2"
    : "https://api-devapps.vfdbank.systems/vtech-wallet/api/v2/wallet2";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function safeJson(resp: Response): Promise<Record<string, unknown>> {
  try { return (await resp.json()) as Record<string, unknown>; } catch { return {}; }
}

async function walletRequest(
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  query?: Record<string, string>,
): Promise<{ data: Record<string, unknown>; status: number }> {
  const token = await getGatewayAccessToken();
  if (!token) return { data: { error: "VFD auth failed" }, status: 401 };
  const url = new URL(`${getWalletBase()}${endpoint}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const resp = await vfdFetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/json", AccessToken: token },
    body: body && method === "POST" ? JSON.stringify(body) : undefined,
  });
  return { data: await safeJson(resp), status: resp.status };
}

async function transferSignature(fromAccount: string, toAccount: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(`${fromAccount}${toAccount}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyVfdTransfer(reference: string): Promise<{ confirmed: boolean; evidence: unknown }> {
  try {
    const { data } = await walletRequest("/transactions", "GET", undefined, { reference });
    const inner = (data?.data as Record<string, unknown>) ?? {};
    const txStatus = String(inner?.transactionStatus ?? inner?.status ?? data?.status ?? "").trim();
    const txMessage = String(inner?.transactionStatusMessage ?? data?.message ?? "");
    return { confirmed: txStatus === "00" && !/pending|fail|revers/i.test(txMessage), evidence: data };
  } catch (e) {
    return { confirmed: false, evidence: { error: e instanceof Error ? e.message : String(e) } };
  }
}

/** Enquiry with the corporate self-enquiry fallback (pool accounts are not
 *  addressable via ?accountNumber= on our wallet credential). */
async function enquiry(accountNumber: string | null) {
  const q: Record<string, string> = {};
  if (accountNumber) q.accountNumber = accountNumber;
  const { data, status } = await walletRequest("/account/enquiry", "GET", undefined, q);
  const ok = status === 200 && String(data?.status ?? "") === "00";
  const env = (data?.data as Record<string, unknown>) || {};
  const acct = (env?.account as Record<string, unknown>) || env;
  const bal = acct?.accountBalance ?? env?.accountBalance;
  return {
    ok,
    balance: bal === undefined || bal === null ? null : Number(bal),
    accountNo: String(env?.accountNo ?? acct?.accountNo ?? ""),
    env,
    acct,
    raw: data,
  };
}

const firstNonEmpty = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = v === undefined || v === null ? "" : String(v).trim();
    if (s) return s;
  }
  return "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = admin();
  const cronOk = await verifyCronToken(req, "vfd-fee-sweep", db);
  if (!cronOk) {
    const adminCaller = await requireAdminJwt(req, db);
    if (!adminCaller) return unauthorized(corsHeaders);
  }

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* no body */ }
  const dryRun = body.dry_run === true;
  const threshold = Number(body.threshold ?? SWEEP_THRESHOLD);
  const onlyUser = typeof body.user_id === "string" ? body.user_id : null;

  try {
    // ── 1. Revenue credits attributed to each user (already recognised) ──
    const { data: revenueAcct } = await db
      .from("vestara_accounts").select("id")
      .eq("account_type", "revenue").is("user_id", null).maybeSingle();

    const earned = new Map<string, number>();
    if (revenueAcct?.id) {
      const { data: feeEntries } = await db
        .from("vestara_ledger_entries")
        .select("credit, vestara_transactions!inner(initiated_by)")
        .eq("account_id", revenueAcct.id)
        .gt("credit", 0);
      for (const e of (feeEntries ?? []) as Array<Record<string, unknown>>) {
        const uid = (e.vestara_transactions as { initiated_by?: string } | null)?.initiated_by;
        if (!uid) continue;
        earned.set(uid, (earned.get(uid) ?? 0) + Number(e.credit ?? 0));
      }
    }

    // ── 2. Already-swept amounts (completed only; failed rows retry) ──
    const swept = new Map<string, number>();
    const { data: prior } = await db
      .from("vfd_fee_sweeps").select("user_id, amount").eq("status", "completed");
    for (const s of (prior ?? []) as Array<Record<string, unknown>>) {
      const uid = String(s.user_id);
      swept.set(uid, (swept.get(uid) ?? 0) + Number(s.amount ?? 0));
    }

    // ── 3. Pool destination identity ──
    // The credential-scoped /account/enquiry does NOT resolve the corporate
    // pool (it is a separate VFD client), so resolve it the way every other
    // pool mover does: intra-bank name enquiry first, enquiry as fallback.
    const { data: rec } = await walletRequest(
      "/transfer/recipient", "GET", undefined,
      { accountNo: POOL_NUBAN, bank: "999999", transfer_type: "intra" },
    );
    const recOk = String((rec as Record<string, unknown>)?.status ?? "") === "00";
    const recData = ((rec as Record<string, unknown>)?.data as Record<string, unknown>) || {};
    const recAcct = (recData?.account as Record<string, unknown>) || {};

    const poolEnq = await enquiry(POOL_NUBAN);
    const poolSelf = poolEnq.ok && poolEnq.balance !== null ? poolEnq : await enquiry(null);

    const toClient = firstNonEmpty(Deno.env.get("VFD_POOL_CLIENT_NAME"), recOk ? recData?.name : "", poolSelf.env?.client, poolSelf.acct?.client, poolSelf.env?.name);
    const toClientId = firstNonEmpty(Deno.env.get("VFD_POOL_CLIENT_ID"), recOk ? recData?.clientId : "", poolSelf.env?.clientId, poolSelf.acct?.clientId);
    const toSavingsId = firstNonEmpty(Deno.env.get("VFD_POOL_SAVINGS_ID"), recOk ? recAcct?.id : "", poolSelf.acct?.id, poolSelf.env?.accountId, poolSelf.env?.id);
    const poolBvn = firstNonEmpty(recOk ? recData?.bvn : "", poolSelf.env?.bvn);
    if (!toClient || !toClientId || !toSavingsId) {
      return json({ error: "Corporate pool identity incomplete", evidence: { recipient: rec, enquiry: poolSelf.raw } }, 502);
    }

    // ── 4. Per-customer sweep ──
    let clientQuery = db
      .from("vfd_sandbox_clients")
      .select("user_id, vfd_account_number, full_name")
      .not("vfd_account_number", "is", null);
    if (onlyUser) clientQuery = clientQuery.eq("user_id", onlyUser);
    const { data: clients } = await clientQuery;

    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const results: Array<Record<string, unknown>> = [];
    let totalSwept = 0;

    for (const c of (clients ?? []) as Array<Record<string, unknown>>) {
      const userId = String(c.user_id);
      const acctNo = String(c.vfd_account_number ?? "");
      if (!acctNo || acctNo.startsWith("9")) continue;          // virtual NUBAN
      if (SKIP_ACCOUNTS.includes(acctNo)) {
        results.push({ user_id: userId, account: acctNo, action: "skipped_by_config" });
        continue;
      }

      const unswept = Math.round(((earned.get(userId) ?? 0) - (swept.get(userId) ?? 0)) * 100) / 100;
      if (unswept < threshold) continue;

      // Cap at real, movable cash: live balance minus the customer's own
      // ledger wallet. Never touch customer money.
      const live = await enquiry(acctNo);
      if (!live.ok || live.balance === null) {
        results.push({ user_id: userId, account: acctNo, action: "enquiry_failed" });
        continue;
      }
      const { data: walletAcct } = await db
        .from("vestara_accounts").select("balance")
        .eq("user_id", userId).eq("account_type", "wallet").maybeSingle();
      const ledgerBal = Number(walletAcct?.balance ?? 0);
      const movable = Math.round((live.balance - ledgerBal) * 100) / 100;
      const amount = Math.round(Math.min(unswept, movable) * 100) / 100;

      if (amount < threshold) {
        results.push({
          user_id: userId, account: acctNo, action: "below_threshold_after_cap",
          unswept, movable, live_balance: live.balance, ledger_balance: ledgerBal,
        });
        continue;
      }

      if (dryRun) {
        results.push({ user_id: userId, account: acctNo, action: "would_sweep", amount, unswept, movable });
        totalSwept += amount;
        continue;
      }

      // Idempotency lock: deterministic reference under a UNIQUE index.
      const reference = `VES-FEESWEEP-${userId.slice(0, 8)}-${day}`;
      const { data: claim, error: claimErr } = await db
        .from("vfd_fee_sweeps")
        .insert({ user_id: userId, vfd_account_number: acctNo, amount, reference, status: "pending" })
        .select("id").maybeSingle();
      if (claimErr || !claim) {
        results.push({ user_id: userId, account: acctNo, action: "already_claimed", reference });
        continue;
      }

      const payload = {
        fromAccount: acctNo,
        fromClientId: String(live.env?.clientId ?? ""),
        fromClient: String(live.env?.client ?? c.full_name ?? ""),
        fromSavingsId: String(live.acct?.id ?? live.env?.accountId ?? ""),
        fromBvn: String(live.env?.bvn ?? ""),
        toAccount: POOL_NUBAN,
        toBank: "999999",
        toClient,
        toClientId,
        toSavingsId,
        toSession: "",
        toBvn: String(poolSelf.env?.bvn ?? ""),
        signature: await transferSignature(acctNo, POOL_NUBAN),
        amount: String(amount),
        remark: "Vestara fee sweep",
        transferType: "intra",
        reference,
        uniqueSenderAccountId: String(live.acct?.id ?? live.env?.accountId ?? ""),
      };

      const { data: transferResp } = await walletRequest("/transfer", "POST", payload);
      const verified = await verifyVfdTransfer(reference);

      if (verified.confirmed) {
        await db.from("vfd_fee_sweeps").update({
          status: "completed",
          vfd_reference: reference,
          completed_at: new Date().toISOString(),
          evidence: { transfer: transferResp, tsq: verified.evidence },
        }).eq("id", claim.id);
        totalSwept += amount;
        results.push({ user_id: userId, account: acctNo, action: "swept", amount, reference });
      } else {
        await db.from("vfd_fee_sweeps").update({
          status: "failed",
          error: String((transferResp as Record<string, unknown>)?.message ?? "unverified"),
          evidence: { transfer: transferResp, tsq: verified.evidence },
        }).eq("id", claim.id);
        results.push({
          user_id: userId, account: acctNo, action: "failed", amount, reference,
          message: String((transferResp as Record<string, unknown>)?.message ?? ""),
        });
      }
    }

    return json({
      ok: true,
      dry_run: dryRun,
      threshold,
      pool_nuban: POOL_NUBAN,
      total_swept: Math.round(totalSwept * 100) / 100,
      swept_count: results.filter((r) => r.action === "swept" || r.action === "would_sweep").length,
      results,
      note: "Cash relocation only — no ledger or revenue-account entries were created or modified.",
    });
  } catch (e) {
    console.error("[fee-sweep] fatal", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
