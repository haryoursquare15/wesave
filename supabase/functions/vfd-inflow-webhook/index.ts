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

const PLATFORM_POOL_NUBAN = "1001695610";

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

  await db.from("vfd_sandbox_notifications").insert({
    user_id: client.user_id,
    title: "Money received",
    message: `₦${amount.toLocaleString()} was credited to your Vestara wallet.`,
    notification_type: "wallet_credit",
  }).then(() => null, () => null);

  const { data: logRow } = await db
    .from("vfd_sandbox_webhook_logs")
    .select("id")
    .eq("event_type", "vfd_inflow_router")
    .eq("processed", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (logRow?.id) {
    await db
      .from("vfd_sandbox_webhook_logs")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("id", logRow.id);
  }


  return ok({ credited: true, reference, amount, account_no: accountNo });
});
