// Unified VFD webhook receiver.
//
// VFD registers ONE callback URL (proxied through https://vfd-gw.vestara.ng).
// This function classifies the event and routes it:
//
//   • mandate lifecycle events        → vfd-mandate-webhook
//   • credits with a GOAL-XXXXXXXX ref → vfd-campaign-inflow-webhook
//   • all other credit/inflow alerts   → credits the owning user's Vestara
//     wallet via the double-entry ledger (vestara_deposit)
//
// Auth: shared secret in `x-webhook-secret` header or `?secret=` query.
// Always returns 200 (except on auth failure) so VFD does not retry-storm.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyWebhookRequest } from "../_shared/webhook-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("VFD_WEBHOOK_SECRET") || "";
const MANDATE_SECRET = Deno.env.get("MANDATE_WEBHOOK_SECRET") || "";

// Every NUBAN Vestara itself owns. Money leaving ANY of these towards a
// customer NUBAN is always ledger-initiated (bill refund/reversal, savings
// payout/rejection refund, split reimbursement, withdrawal settlement), so the
// wallet was already credited internally — crediting again double-pays.
const PLATFORM_POOL_NUBAN = "1001695610";
const INTERNAL_NUBANS = new Set(
  [
    PLATFORM_POOL_NUBAN,
    Deno.env.get("VFD_CORPORATE_POOL_NUBAN") || "1047279595",
    Deno.env.get("VFD_CORPORATE_ACCOUNT_NUMBER") || "",
    "1048523714", // Vault sub-account
    "1048523721", // Goal Savings sub-account
    "1048523738", // Upfront Yield sub-account
    "1048523745", // Lock Max sub-account
  ].filter(Boolean),
);

// Narrations VFD stamps on pool→customer settlements. VFD frequently omits the
// originator account number on intra-bank movements, so the narration is the
// only remaining signal that this credit mirrors an internal ledger entry.
const INTERNAL_NARRATION_PATTERNS: RegExp[] = [
  /^\s*from\s+wesave\s+ng\s+ltd\s*\//i,
  /^\s*from\s+vestara\b/i,
  /vestara-(bill|savings|split|transfer)-/i,
  // Fee sweep: customer sub-account → corporate pool. Never a customer credit.
  /vestara\s+fee\s+sweep/i,
  /VES-FEESWEEP-/i,
  /\b(bill\s+refund|investment\s+reversal|split\s+share\s+reimbursement|savings\s+refund|thrift\s+payout)\b/i,
];

function isInternalSettlement(payerAccount: string, payerName: string, narration: string) {
  if (payerAccount && INTERNAL_NUBANS.has(payerAccount)) return "pool_nuban_originator";
  if (payerName && /(wesave\s+ng\s+ltd|vestara)/i.test(payerName) && !/[|]/.test(narration)) {
    return "internal_originator_name";
  }
  if (narration && INTERNAL_NARRATION_PATTERNS.some((re) => re.test(narration))) {
    return "internal_settlement_narration";
  }
  return null;
}


function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function forward(fn: string, secret: string, payload: unknown) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch (err) {
    console.error(`[vfd-inflow] forward to ${fn} failed`, err);
    return { status: 500, body: { error: String(err) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return ok({ error: "Method not allowed" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Multi-layer verification: constant-time shared secret, optional HMAC-SHA256
  // signature over the raw body, and replay-window enforcement. Every rejection
  // is logged to vfd_sandbox_webhook_logs + edge logs for probe alerting.
  const verified = await verifyWebhookRequest(req, {
    secret: WEBHOOK_SECRET,
    db,
    source: "vfd-inflow-webhook",
  });
  if (!verified.ok) {
    return ok({ error: "Unauthorized" }, verified.status);
  }
  const payload = verified.payload;
  const p = payload as Record<string, unknown> & { data?: Record<string, unknown> };
  const root = (p.data && typeof p.data === "object") ? p.data as Record<string, unknown> : p;
  const get = (k: string): string => {
    const v = root[k];
    return v == null ? "" : String(v);
  };

  // Raw audit trail
  const { data: auditRow } = await db.from("vfd_sandbox_webhook_logs").insert({
    event_type: "vfd_inflow_router",
    payload,
    processed: false,
  }).select("id").maybeSingle();
  const auditId = (auditRow as { id?: string } | null)?.id ?? null;


  // ── 1. Mandate lifecycle event? ───────────────────────────────
  const mandateCode = get("mandateCode") || get("mandate_code");
  const workflow = get("mandateWorkflowStatus") || get("mandate_workflow_status") ||
    get("mandateWorkflowStatusDescription") || get("mandate_workflow_status_description");
  if (mandateCode || workflow) {
    const r = await forward("vfd-mandate-webhook", MANDATE_SECRET, payload);
    return ok({ routed: "mandate", upstream_status: r.status, result: r.body });
  }

  // ── 2. Credit alert ───────────────────────────────────────────
  // NOTE: `account_number` / `accountNo` is the CREDITED (receiving) NUBAN —
  // never confuse it with `originator_account_number`, which is the SENDER.
  const accountNo = get("account_number") || get("accountNo") || get("account_no") ||
    get("creditAccount") || get("credit_account");
  const amount = Number(get("amount") || get("transactionAmount") || get("transaction_amount"));
  const sessionId = get("session_id") || get("sessionId") || get("reference");
  const narration = get("originator_narration") || get("originatorNarration") ||
    get("narration") || get("description") || "";
  const vfdRef = get("reference") || get("originator_reference") || get("originatorReference") || sessionId;


  if (!amount || amount <= 0) return ok({ ignored: true, reason: "Invalid or missing amount" });
  if (!sessionId) return ok({ ignored: true, reason: "Missing sessionId" });

  // 2a. Goal-Fund campaign payment (reference GOAL-XXXXXXXX in narration)
  const goalRef = `${narration} ${sessionId} ${vfdRef}`.toUpperCase().match(/GOAL-[A-F0-9]{8}/);
  if (goalRef) {
    const r = await forward("vfd-campaign-inflow-webhook", WEBHOOK_SECRET, payload);
    return ok({ routed: "campaign", ref: goalRef[0], upstream_status: r.status, result: r.body });
  }

  // 2b. Direct credit to a user sub-account NUBAN
  if (!accountNo) return ok({ ignored: true, reason: "Missing accountNo" });

  if (accountNo === PLATFORM_POOL_NUBAN) {
    // Unattributed pool credit — leave for the reconciler / ops review.
    return ok({ ignored: true, reason: "Unattributed pool credit — flagged for reconciliation" });
  }

  const { data: client } = await db
    .from("vfd_sandbox_clients")
    .select("user_id")
    .eq("vfd_account_number", accountNo)
    .maybeSingle();

  if (!client?.user_id) {
    return ok({ ignored: true, reason: "No Vestara account matches this NUBAN", accountNo });
  }

  const reference = `VFDIN-${sessionId}`;

  // Idempotency: a prior credit with this reference means VFD retried.
  const { data: existing } = await db
    .from("vestara_transactions")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();
  if (existing) return ok({ deduped: true, reference });

  // Intra-Vestara guard: when the sender is also a Vestara user, vfd-banking
  // already mirrored the credit as `<ref>-IN` at transfer time. VFD then fires
  // this inflow alert for the same money — crediting again would double-pay.
  const dedupe = async (): Promise<string | null> => {
    // (a) Match on the VFD session id / reference when the mirror captured it.
    const sessionKeys = [sessionId, vfdRef].filter(Boolean);
    if (sessionKeys.length) {
      const orFilter = sessionKeys
        .flatMap((k) => [`session_id.eq.${k}`, `vfd_reference.eq.${k}`])
        .join(",");
      const { data: m } = await db
        .from("vfd_sandbox_transactions")
        .select("id, reference")
        .eq("user_id", client.user_id)
        .eq("transaction_type", "credit")
        .or(orFilter)
        .limit(1)
        .maybeSingle();
      if (m) return (m as { reference?: string }).reference ?? "matched_session";
    }

    // (b) VFD's intra (/transfer, bankCode 999999) response omits sessionId, so
    // the mirror row can have NULL session_id/vfd_reference. Fall back to a
    // same-amount, same-destination mirror deposit inside a short window.
    const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: recent } = await db
      .from("vestara_transactions")
      .select("reference, amount, metadata, created_at")
      .eq("initiated_by", client.user_id)
      .eq("type", "deposit")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(25);
    for (const row of (recent ?? []) as Array<Record<string, unknown>>) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      if (meta.source !== "vfd_transfer_mirror") continue;
      if (String(meta.to_account ?? "") !== accountNo) continue;
      if (Math.abs(Number(row.amount) - amount) > 0.009) continue;
      return String(row.reference);
    }
    return null;
  };

  // Internal-settlement guard: money leaving ANY Vestara-owned NUBAN towards a
  // customer NUBAN is ALWAYS ledger-initiated (bill refund/reversal, savings
  // payout or rejection refund, split reimbursement, withdrawal settlement).
  // The ledger already credited the wallet at that moment, so crediting again
  // here double-pays the customer. VFD often omits the originator account on
  // intra-bank movements, so we also match the originator name and the
  // settlement narration VFD stamps on these transfers.
  const payerAccount = String(
    get("originator_account_number") || get("originatorAccountNumber") || get("sourceAccount") || "",
  );
  const payerName = String(
    get("originator_account_name") || get("originatorName") || get("sourceName") || "",
  );
  const internalReason = isInternalSettlement(payerAccount, payerName, narration);
  if (internalReason) {
    console.log("[vfd-inflow] internal settlement ignored", internalReason, accountNo, amount, narration);
    if (auditId) {
      await db.from("vfd_sandbox_webhook_logs")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("id", auditId);
    }
    return ok({
      deduped: true,
      reason: "internal_settlement_already_ledgered",
      detail: internalReason,
      accountNo,
      amount,
      narration,
    });
  }


  const dupRef = await dedupe();
  if (dupRef) {
    if (auditId) {
      await db.from("vfd_sandbox_webhook_logs")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("id", auditId);
    }
    return ok({ deduped: true, reason: "already_credited_by_intra_transfer_mirror", reference: dupRef });
  }
  // Real-time duplicate-credit guard: fuzzy (amount + source + narration +
  // window) as well as exact reference, and it writes the structured audit
  // record for this credit attempt.
  const { data: guardRes } = await db.rpc("guard_credit", {
    _user_id: client.user_id,
    _amount: amount,
    _reference: reference,
    _source: "vfd_inflow_webhook",
    _narration: narration || null,
    _trigger_event: `vfd_session:${sessionId}`,
    _details: { account_no: accountNo, vfd_reference: vfdRef },
  });
  const guard = (guardRes ?? {}) as { allowed?: boolean; reason?: string; flagged?: boolean };
  if (guard.allowed === false) {
    console.error("[vfd-inflow] credit BLOCKED by guard", guard.reason, reference);
    return ok({ blocked: true, reason: guard.reason, reference });
  }

  const { data: dep, error: depErr } = await db.rpc("vestara_deposit", {
    _user_id: client.user_id,
    _amount: amount,
    _reference: reference,
    _metadata: {
      source: "vfd_inflow_webhook",
      account_no: accountNo,
      vfd_session_id: sessionId,
      vfd_reference: vfdRef,
      narration,
      // Sender details only — informational metadata, never used for lookup.
      payer_name: get("originator_account_name") || get("originatorName") || get("sourceName") || null,
      payer_account: get("originator_account_number") || get("originatorAccountNumber") || get("sourceAccount") || null,
      payer_bank: get("originator_bank") || get("originatorBankName") || get("sourceBank") || null,
    },
  });

  const result = dep as { success?: boolean; error?: string } | null;
  if (depErr || !result?.success) {
    console.error("[vfd-inflow] vestara_deposit failed", depErr || result);
    return ok({ error: depErr?.message || result?.error || "ledger_deposit_failed", reference });
  }

  // Credit row so the inbound transfer shows in the customer's history
  // (also acts as the dedupe marker for any later replay of this session).
  await db.from("vfd_sandbox_transactions").insert({
    user_id: client.user_id,
    vfd_account_number: accountNo,
    amount,
    transaction_type: "credit",
    status: "completed",
    reference,
    vfd_reference: vfdRef || null,
    session_id: sessionId,
    beneficiary_account: get("originator_account_number") || get("originatorAccountNumber") || null,
    beneficiary_name: get("originator_account_name") || get("originatorName") || null,
    description: narration || "Transfer received",
    committed_at: new Date().toISOString(),
    metadata: { source: "vfd_inflow_webhook" },
  }).then(() => null, () => null);

  await db.from("vfd_sandbox_notifications").insert({
    user_id: client.user_id,
    title: "Money received",
    message: `₦${amount.toLocaleString()} was credited to your Vestara wallet.`,
    notification_type: "wallet_credit",
  }).then(() => null, () => null);

  if (auditId) {
    await db
      .from("vfd_sandbox_webhook_logs")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("id", auditId);
  }

  return ok({ credited: true, reference, amount, account_no: accountNo });
});

