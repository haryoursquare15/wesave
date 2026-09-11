// Inbound-credit catch-up sweeper.
//
// WHY THIS EXISTS
// VFD delivers inbound credit alerts to ONE callback URL that is proxied
// through the Vestara gateway droplet. While that droplet is down, VFD's
// callbacks fail and the wallet credit never happens even though real money
// landed on the customer's NUBAN. Webhooks alone are therefore NOT a reliable
// source of truth for money-in.
//
// This worker closes that hole: it pulls the authoritative VFD account
// statement for every customer NUBAN, finds credits that were never posted
// internally, and credits them through the exact same guarded path the webhook
// uses (`guard_credit` → `vestara_deposit`), with the SAME reference scheme
// (`VFDIN-<sessionId>`) so a late webhook replay can never double-pay.
//
// Auth: `x-cron-token` (cron) or an admin JWT (manual/admin console run).
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyCronToken, requireAdminJwt, unauthorized } from "../_shared/cron-auth.ts";
import { vfdFetch, getGatewayAccessToken } from "../_shared/vfd-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token",
};

const WALLET_BASE_TEST = "https://api-devapps.vfdbank.systems/vtech-wallet/api/v2/wallet2";
const WALLET_BASE_LIVE = "https://api-apps.vfdbank.systems/vtech-wallet/api/v2/wallet2";

function walletBase(): string {
  const mode = (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase();
  return mode === "production" || mode === "live" ? WALLET_BASE_LIVE : WALLET_BASE_TEST;
}

// Vestara-owned NUBANs. A credit originating from one of these is an internal
// settlement (payout / refund / reimbursement) that the ledger already booked.
const INTERNAL_NUBANS = new Set(
  [
    "1001695610",
    Deno.env.get("VFD_CORPORATE_POOL_NUBAN") || "1047279595",
    Deno.env.get("VFD_CORPORATE_ACCOUNT_NUMBER") || "",
    "1048523714",
    "1048523721",
    "1048523738",
    "1048523745",
  ].filter(Boolean),
);

const INTERNAL_NARRATION_PATTERNS: RegExp[] = [
  /^\s*from\s+wesave\s+ng\s+ltd\s*\//i,
  /^\s*from\s+vestara\b/i,
  /vestara-(bill|savings|split|transfer)-/i,
  /vestara\s+fee\s+sweep/i,
  /VES-FEESWEEP-/i,
  /\b(bill\s+refund|investment\s+reversal|split\s+share\s+reimbursement|savings\s+refund|thrift\s+payout|savings\s+maturity|early\s+withdrawal)\b/i,
];

function isInternalSettlement(payerAccount: string, payerName: string, narration: string): string | null {
  if (payerAccount && INTERNAL_NUBANS.has(payerAccount)) return "pool_nuban_originator";
  if (payerName && /(wesave\s+ng\s+ltd|vestara)/i.test(payerName)) return "internal_originator_name";
  if (narration && INTERNAL_NARRATION_PATTERNS.some((re) => re.test(narration))) {
    return "internal_settlement_narration";
  }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v).trim());

async function walletGet(endpoint: string, query: Record<string, string>) {
  const token = await getGatewayAccessToken();
  if (!token) return { data: {} as Record<string, unknown>, status: 401 };
  const url = new URL(`${walletBase()}${endpoint}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const resp = await vfdFetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json", AccessToken: token },
  });
  let data: Record<string, unknown> = {};
  try {
    const raw = await resp.text();
    data = raw ? JSON.parse(raw) : {};
  } catch { /* non-JSON */ }
  return { data, status: resp.status };
}

interface StatementRow {
  amount: number;
  isCredit: boolean;
  sessionId: string;
  reference: string;
  narration: string;
  payerAccount: string;
  payerName: string;
  date: string;
  raw: Record<string, unknown>;
}

/** VFD statement payloads vary by endpoint version — parse defensively. */
function parseStatement(data: Record<string, unknown>): StatementRow[] {
  const env = (data?.data as Record<string, unknown>) || {};
  const candidates = [env.content, env.transactions, env.items, env.data, data.content, env];
  let list: unknown[] = [];
  for (const c of candidates) {
    if (Array.isArray(c)) { list = c; break; }
  }
  return list.filter((r) => r && typeof r === "object").map((r) => {
    const t = r as Record<string, unknown>;
    const typeTag = str(t.transactionType ?? t.type ?? t.drCr ?? t.transactionIndicator).toUpperCase();
    const creditFlag = /^C/.test(typeTag) || /credit/i.test(typeTag);
    const credAmt = Number(String(str(t.creditAmount ?? "")).replace(/,/g, ""));
    const amtRaw = str(t.amount ?? t.transactionAmount ?? t.creditAmount ?? t.txnAmount);
    const amount = Number(String(amtRaw).replace(/,/g, "")) || (Number.isFinite(credAmt) ? credAmt : 0);
    return {
      amount: Number.isFinite(amount) ? amount : 0,
      isCredit: creditFlag || (!typeTag && credAmt > 0),
      sessionId: str(t.sessionId ?? t.session_id ?? t.instrumentNo ?? t.instrumentNumber ?? t.uniqueId),
      reference: str(t.referenceNumber ?? t.reference ?? t.transactionRef ?? t.txnRef),
      narration: str(t.narration ?? t.transactionSummary ?? t.description ?? t.remarks),
      payerAccount: str(t.originatorAccountNumber ?? t.originator_account_number ?? t.senderAccountNumber ?? t.fromAccount),
      payerName: str(t.originatorAccountName ?? t.originatorName ?? t.senderName ?? t.fromClient),
      date: str(t.transactionDate ?? t.date ?? t.createdAt ?? t.transactionTime),
      raw: t,
    };
  }).filter((r) => r.amount > 0 && r.isCredit);
}

// deno-lint-ignore no-explicit-any
type Db = any;

async function alreadyPosted(db: Db, userId: string, keys: string[], amount: number, dateISO: string | null) {
  const refs = keys.filter(Boolean).map((k) => `VFDIN-${k}`);
  if (refs.length) {
    const { data } = await db.from("vestara_transactions")
      .select("id, reference").in("reference", refs).limit(1).maybeSingle();
    if (data) return { posted: true, reason: "reference_exists", reference: (data as { reference?: string }).reference };
  }
  if (keys.filter(Boolean).length) {
    const orFilter = keys.filter(Boolean)
      .flatMap((k) => [`session_id.eq.${k}`, `vfd_reference.eq.${k}`]).join(",");
    const { data } = await db.from("vfd_sandbox_transactions")
      .select("id, reference").eq("user_id", userId).eq("transaction_type", "credit")
      .or(orFilter).limit(1).maybeSingle();
    if (data) return { posted: true, reason: "session_matched", reference: (data as { reference?: string }).reference };
  }
  // Fallback: an identically-sized credit for this user within ±36h of the
  // statement timestamp is treated as the same money (statement rows do not
  // always carry a session id).
  if (dateISO) {
    const t = new Date(dateISO).getTime();
    if (Number.isFinite(t)) {
      const from = new Date(t - 36 * 3600_000).toISOString();
      const to = new Date(t + 36 * 3600_000).toISOString();
      const { data } = await db.from("vfd_sandbox_transactions")
        .select("id, reference, amount")
        .eq("user_id", userId).eq("transaction_type", "credit")
        .gte("created_at", from).lte("created_at", to);
      const hit = (data || []).find((r: Record<string, unknown>) => Math.abs(Number(r.amount) - amount) < 0.01);
      if (hit) return { posted: true, reason: "amount_window_matched", reference: String(hit.reference || "") };
    }
  }
  return { posted: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const authorised = (await verifyCronToken(req, "vfd_inflow_catchup", db)) ||
    !!(await requireAdminJwt(req, db));
  if (!authorised) return unauthorized(corsHeaders);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }

  const accountNo = str(body.accountNo);
  const dryRun = body.dryRun === true;
  // Diagnostics: return the raw VFD statement payload (shape varies by tenant).
  const debug = body.debug === true;
  const days = Math.min(Number(body.days) || 7, 90);

  let q = db.from("vfd_sandbox_clients").select("user_id, vfd_account_number, full_name")
    .not("vfd_account_number", "is", null);
  if (accountNo) q = q.eq("vfd_account_number", accountNo);
  const { data: clients } = await q;

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10) + " 00:00:00";
  const endDate = now.toISOString().slice(0, 10) + " 23:59:59";

  const scanned: unknown[] = [];
  let credited = 0, creditedAmount = 0, skipped = 0, failed = 0;

  for (const c of (clients || []) as Array<Record<string, string>>) {
    const nuban = c.vfd_account_number;
    const { data: stmt, status } = await walletGet("/account/transactions", {
      accountNo: nuban, transactionType: "wallet", startDate, endDate, page: "0", size: "100",
    });
    if (status !== 200 || str(stmt?.status) !== "00") {
      failed++;
      scanned.push({ account: nuban, error: "statement_unavailable", vfd_status: status, body: stmt });
      continue;
    }
    if (debug) {
      console.log(`[catchup][debug] ${nuban}`, JSON.stringify(stmt).slice(0, 4000));
      scanned.push({ account: nuban, raw_statement: stmt, parsed: parseStatement(stmt) });
    }


    for (const row of parseStatement(stmt)) {
      const internal = isInternalSettlement(row.payerAccount, row.payerName, row.narration);
      if (internal) { skipped++; continue; }

      const keys = [row.sessionId, row.reference].filter(Boolean);
      const dateISO = row.date ? row.date.replace(" ", "T") : null;
      const dupe = await alreadyPosted(db, c.user_id, keys, row.amount, dateISO);
      if (dupe.posted) { skipped++; continue; }

      const reference = `VFDIN-${keys[0] || `STMT-${nuban}-${row.date}-${row.amount}`.replace(/[^A-Za-z0-9-]/g, "")}`;
      const record = {
        account: nuban, user_id: c.user_id, amount: row.amount, reference,
        narration: row.narration, payer: row.payerName, date: row.date,
      };

      if (dryRun) { scanned.push({ ...record, action: "would_credit" }); continue; }

      const { data: guardRes } = await db.rpc("guard_credit", {
        _user_id: c.user_id,
        _amount: row.amount,
        _reference: reference,
        _source: "vfd_inflow_catchup",
        _narration: row.narration || null,
        _trigger_event: `vfd_statement:${keys[0] || row.date}`,
        _details: { account_no: nuban, statement_row: row.raw },
      });
      const guard = (guardRes ?? {}) as { allowed?: boolean; reason?: string };
      if (guard.allowed === false) {
        skipped++;
        scanned.push({ ...record, action: "blocked", reason: guard.reason });
        continue;
      }

      const { data: dep, error: depErr } = await db.rpc("vestara_deposit", {
        _user_id: c.user_id,
        _amount: row.amount,
        _reference: reference,
        _metadata: {
          source: "vfd_inflow_catchup",
          account_no: nuban,
          vfd_session_id: row.sessionId || null,
          vfd_reference: row.reference || null,
          narration: row.narration,
          payer_name: row.payerName || null,
          payer_account: row.payerAccount || null,
          statement_date: row.date || null,
        },
      });
      const result = dep as { success?: boolean; error?: string } | null;
      if (depErr || !result?.success) {
        failed++;
        scanned.push({ ...record, action: "ledger_failed", error: depErr?.message || result?.error });
        continue;
      }

      await db.from("vfd_sandbox_transactions").insert({
        user_id: c.user_id,
        vfd_account_number: nuban,
        amount: row.amount,
        transaction_type: "credit",
        status: "completed",
        reference,
        vfd_reference: row.reference || null,
        session_id: row.sessionId || null,
        beneficiary_account: row.payerAccount || null,
        beneficiary_name: row.payerName || null,
        description: row.narration || "Transfer received",
        committed_at: new Date().toISOString(),
        metadata: { source: "vfd_inflow_catchup" },
      }).then(() => null, () => null);

      await db.from("vfd_sandbox_notifications").insert({
        user_id: c.user_id,
        title: "Money received",
        message: `₦${row.amount.toLocaleString()} was credited to your Vestara wallet.`,
        notification_type: "wallet_credit",
      }).then(() => null, () => null);

      credited++;
      creditedAmount += row.amount;
      scanned.push({ ...record, action: "credited" });
    }
  }

  const summary = {
    accounts: (clients || []).length,
    window_days: days,
    dry_run: dryRun,
    credited,
    credited_amount: creditedAmount,
    skipped,
    failed,
    details: scanned,
  };

  await db.from("vfd_sandbox_webhook_logs").insert({
    event_type: "vfd_inflow_catchup",
    payload: summary,
    processed: true,
    processed_at: new Date().toISOString(),
  }).then(() => null, () => null);

  console.log("[vfd-inflow-catchup]", JSON.stringify({ ...summary, details: undefined }));
  return json(summary);
});
