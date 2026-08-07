// VFD inflow webhook for Goal-Fund public payment links.
//
// VFD posts here on every credit to the Vestara corporate pool NUBAN. We
// match the credit to a campaign by extracting the "GOAL-XXXXXXXX" reference
// from the originator narration (or sessionId metadata), then credit the
// campaign's escrow_balance + raised_amount.
//
// The function is idempotent: vfd_sandbox_campaign_inflows has a UNIQUE index
// on vfd_session_id, so VFD's retry attempts can't double-credit.
//
// Auth: shared secret in header `x-webhook-secret` OR query `?secret=...`
// (VFD callback configs vary). Reuses VFD_WEBHOOK_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeEqual, logAuthFailure } from "../_shared/webhook-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("VFD_WEBHOOK_SECRET") || "";

// Vestara corporate pool NUBAN at VFD MFB. All public campaign inflows must
// land here; per-user inflows are handled by vfd-pool-reconciler instead.
const PLATFORM_POOL_NUBAN = "1001695610";

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Extract "GOAL-XXXXXXXX" from any string.
function extractReference(...sources: string[]): string | null {
  const joined = sources.filter(Boolean).join(" ").toUpperCase();
  const match = joined.match(/GOAL-[A-F0-9]{8}/);
  return match ? match[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return ok({ error: "Method not allowed" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // 1. Shared secret — constant-time compare, failures audited.
  const headerSecret = req.headers.get("x-webhook-secret") || req.headers.get("X-Webhook-Secret") || "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") || "";
  const secretOk = Boolean(WEBHOOK_SECRET) &&
    (timingSafeEqual(headerSecret, WEBHOOK_SECRET) || timingSafeEqual(querySecret, WEBHOOK_SECRET));
  if (!secretOk) {
    await logAuthFailure(db, req, "vfd-campaign-inflow-webhook", "invalid_or_missing_secret");
    return ok({ error: "Unauthorized" }, 401);
  }

  // 2. Parse payload defensively (VFD schemas vary)
  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { payload = {}; }
  const p = payload as Record<string, unknown> & { data?: Record<string, unknown> };
  const root = (p.data && typeof p.data === "object") ? p.data : p;

  const get = (key: string): string => {
    const v = (root as Record<string, unknown>)[key];
    return v == null ? "" : String(v);
  };
  const accountNo = get("accountNo") || get("account_no") || get("creditAccount");
  const amountStr = get("amount") || get("transactionAmount");
  const amount = Number(amountStr);
  const sessionId = get("sessionId") || get("session_id") || get("reference");
  const vfdRef = get("reference") || get("originatorReference") || sessionId;
  const narration = get("originatorNarration") || get("narration") || get("description") || "";
  const payerAccount = get("originatorAccountNumber") || get("sourceAccount") || "";
  const payerName = get("originatorName") || get("sourceName") || "";
  const payerBank = get("originatorBankName") || get("sourceBank") || "";

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Log raw event for traceability (admin-only readable)
  await db.from("vfd_sandbox_webhook_logs").insert({
    event_type: "campaign_inflow",
    payload,
    processed: false,
  });

  // 3. Validate
  if (!accountNo || accountNo !== PLATFORM_POOL_NUBAN) {
    return ok({ ignored: true, reason: "Not the platform pool account" });
  }
  if (!amount || amount <= 0) {
    return ok({ ignored: true, reason: "Invalid amount" });
  }
  if (!sessionId) {
    return ok({ ignored: true, reason: "Missing sessionId" });
  }

  // 4. Match campaign by reference in narration / sessionId / vfdRef
  const ref = extractReference(narration, sessionId, vfdRef);
  if (!ref) {
    return ok({ ignored: true, reason: "No GOAL-* reference in narration" });
  }
  const idPrefix = ref.replace("GOAL-", "").toLowerCase();

  const { data: campaigns, error: campErr } = await db
    .from("vfd_sandbox_campaigns")
    .select("id, creator_id, title, goal_amount, raised_amount, escrow_balance, contributor_count, status")
    .ilike("id", `${idPrefix}%`)
    .limit(2);

  if (campErr || !campaigns || campaigns.length === 0) {
    return ok({ ignored: true, reason: "Campaign not found for reference", ref });
  }
  if (campaigns.length > 1) {
    // Ambiguous prefix — refuse to credit and let an admin investigate.
    return ok({ ignored: true, reason: "Ambiguous reference prefix", ref });
  }
  const campaign = campaigns[0];
  if (campaign.status !== "active" && campaign.status !== "completed") {
    return ok({ ignored: true, reason: "Campaign not active" });
  }

  // 5. Idempotent insert into inflow ledger. UNIQUE(vfd_session_id) protects
  //    against double-credit on VFD retries.
  const { error: inflowErr } = await db
    .from("vfd_sandbox_campaign_inflows")
    .insert({
      campaign_id: campaign.id,
      amount,
      vfd_session_id: sessionId,
      vfd_reference: vfdRef || null,
      payer_account: payerAccount || null,
      payer_name: payerName || null,
      payer_bank: payerBank || null,
      narration: narration || null,
      raw_payload: payload,
      source: "bank_transfer",
      status: "credited",
    });

  if (inflowErr) {
    const msg = inflowErr.message || "";
    if (msg.toLowerCase().includes("duplicate") || msg.includes("vfd_sandbox_campaign_inflows_session_uq")) {
      return ok({ deduped: true, sessionId });
    }
    return ok({ error: msg }, 200); // 200 to prevent VFD retry storms; logged above
  }

  // 6. Update campaign aggregates + record an anonymous contribution row so
  //    public ledgers reflect the inflow.
  const newRaised = Number(campaign.raised_amount) + amount;
  const newEscrow = Number(campaign.escrow_balance || 0) + amount;
  const newCount = Number(campaign.contributor_count || 0) + 1;
  const updates: Record<string, unknown> = {
    raised_amount: newRaised,
    escrow_balance: newEscrow,
    contributor_count: newCount,
    updated_at: new Date().toISOString(),
  };
  if (newRaised >= Number(campaign.goal_amount)) updates.status = "completed";
  await db.from("vfd_sandbox_campaigns").update(updates).eq("id", campaign.id);

  await db.from("vfd_sandbox_campaign_contributions").insert({
    campaign_id: campaign.id,
    contributor_id: null,
    amount,
    anonymous: true,
    message: null,
    contributor_name: payerName || "Bank Transfer",
    contribution_reference: sessionId,
  });

  // 7. Notify creator
  await db.from("vfd_sandbox_notifications").insert({
    user_id: campaign.creator_id,
    title: "New campaign contribution",
    body: `Your campaign "${campaign.title}" received ₦${amount.toLocaleString()} via bank transfer. Escrow: ₦${newEscrow.toLocaleString()}.`,
    type: "campaign_contribution",
    read: false,
  });

  // 8. Mark webhook log processed (best effort — we already wrote one above)
  await db
    .from("vfd_sandbox_webhook_logs")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq("event_type", "campaign_inflow")
    .eq("processed", false)
    .order("created_at", { ascending: false })
    .limit(1);

  return ok({
    credited: true,
    campaign_id: campaign.id,
    amount,
    raised_amount: newRaised,
    escrow_balance: newEscrow,
  });
});
