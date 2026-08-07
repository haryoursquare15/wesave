// VFD Direct Debit Mandate webhook receiver.
//
// Register this function's public URL with VFD BaaS as the mandate callback.
// VFD will POST mandate lifecycle events here. We verify a shared secret
// (MANDATE_WEBHOOK_SECRET), flip the membership to `authorized` when the bank
// approves, log every event to vfd_sandbox_group_mandates, and trigger the
// commencement-readiness recompute on the parent thrift group.
//
// IMPORTANT: this function MUST always return 200 unless auth fails. VFD
// retries on non-2xx and we don't want duplicate retries clobbering state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeEqual, logAuthFailure } from "../_shared/webhook-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MANDATE_WEBHOOK_SECRET") || "";

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return ok({ error: "Method not allowed" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // 1. Verify shared secret (constant-time). Accept either header or query
  //    token to tolerate VFD configs that don't allow custom headers.
  const headerSecret = req.headers.get("x-webhook-secret") || req.headers.get("X-Webhook-Secret") || "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") || "";
  const secretOk = Boolean(WEBHOOK_SECRET) &&
    (timingSafeEqual(headerSecret, WEBHOOK_SECRET) || timingSafeEqual(querySecret, WEBHOOK_SECRET));
  if (!secretOk) {
    await logAuthFailure(db, req, "vfd-mandate-webhook", "invalid_or_missing_secret");
    return ok({ error: "Unauthorized" }, 401);
  }

  // 2. Parse payload — be defensive, VFD's schema has drifted historically.
  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { payload = {}; }
  const reference = String((payload as any)?.reference || (payload as any)?.data?.reference || "");
  const mandateCode = String((payload as any)?.mandateCode || (payload as any)?.data?.mandateCode || "");
  const workflowStatus = String(
    (payload as any)?.mandateWorkflowStatus ||
    (payload as any)?.data?.mandateWorkflowStatus ||
    (payload as any)?.mandateWorkflowStatusDescription ||
    "",
  );


  // 3. Locate the membership by mandate_reference (preferred) or mandate_code.
  let memberQuery = db.from("vfd_sandbox_group_members")
    .select("id, group_id, user_id, mandate_status, mandate_reference, mandate_code");
  if (reference) memberQuery = memberQuery.eq("mandate_reference", reference);
  else if (mandateCode) memberQuery = memberQuery.eq("mandate_code", mandateCode);
  else return ok({ received: true, matched: false });

  const { data: member } = await memberQuery.maybeSingle();
  if (!member) {
    // Still log it for audit trail without a group context.
    await db.from("vfd_sandbox_group_mandates").insert({
      thrift_group_id: null, member_user_id: null,
      mandate_reference: reference || null, mandate_code: mandateCode || null,
      event_type: "status_checked",
      event_payload: { source: "webhook", unmatched: true, payload },
    } as never).select().maybeSingle().catch(() => null);
    return ok({ received: true, matched: false });
  }

  const approved = /bank.?approved|approved|active/i.test(workflowStatus);
  const failed = /reject|fail|cancel|revoke/i.test(workflowStatus);
  const nowIso = new Date().toISOString();

  if (approved && member.mandate_status !== "authorized") {
    await db.from("vfd_sandbox_group_members").update({
      mandate_status: "authorized",
      mandate_authorized_at: nowIso,
    }).eq("id", member.id);

    await db.from("vfd_sandbox_group_mandates").insert({
      thrift_group_id: member.group_id,
      member_user_id: member.user_id,
      mandate_reference: member.mandate_reference,
      mandate_code: member.mandate_code,
      event_type: "authorized",
      event_payload: { source: "webhook", workflowStatus, payload },
    });

    await db.from("vfd_sandbox_notifications").insert({
      user_id: member.user_id,
      title: "Mandate Approved",
      message: "Your direct debit mandate is approved.",
      type: "ddm_mandate_authorized",
      reference_id: member.group_id,
    } as never).catch(() => null);
  } else if (failed) {
    await db.from("vfd_sandbox_group_members").update({ mandate_status: "failed" }).eq("id", member.id);
    await db.from("vfd_sandbox_group_mandates").insert({
      thrift_group_id: member.group_id,
      member_user_id: member.user_id,
      mandate_reference: member.mandate_reference,
      mandate_code: member.mandate_code,
      event_type: "failed",
      event_payload: { source: "webhook", workflowStatus, payload },
    });
  } else {
    await db.from("vfd_sandbox_group_mandates").insert({
      thrift_group_id: member.group_id,
      member_user_id: member.user_id,
      mandate_reference: member.mandate_reference,
      mandate_code: member.mandate_code,
      event_type: "status_checked",
      event_payload: { source: "webhook", workflowStatus, payload },
    });
  }

  return ok({ received: true, matched: true, action: approved ? "authorized" : failed ? "failed" : "logged" });
});
