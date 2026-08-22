import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBrandedEmail } from "../_shared/send-branded-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "vfd-sandbox-kyc-docs";
const SIGNED_URL_TTL = 300; // 5 minutes

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Db = ReturnType<typeof createClient>;

interface ClientRow {
  user_id: string;
  full_name: string | null;
  bvn: string | null;
  nin: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  tier: string | null;
  vfd_account_number: string | null;
  account_status: string | null;
  kyc_review_status: string | null;
  kyc_review_reason: string | null;
  kyc_reviewed_by: string | null;
  kyc_reviewed_at: string | null;
  kyc_requested_tier: number | null;
}

interface DocRow {
  id: string;
  user_id: string;
  tier_level: number | null;
  document_type: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  verification_status: string;
  uploaded_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

async function loadProfiles(db: Db, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, Record<string, unknown>>();
  const { data } = await db
    .from("profiles")
    .select("id, full_name, username, email")
    .in("id", userIds);
  return new Map((data || []).map((p: Record<string, unknown>) => [p.id as string, p]));
}

/** Pending queue: one entry per customer, aggregating their submitted documents. */
async function listSubmissions(db: Db, status: string) {
  const { data: docs, error } = await db
    .from("vfd_sandbox_kyc_documents")
    .select("*")
    .order("uploaded_at", { ascending: true })
    .limit(500);

  if (error) return json({ error: error.message }, 500);

  const rows = (docs || []) as DocRow[];
  const userIds = [...new Set(rows.map((d) => d.user_id))];

  const [{ data: clients }, profiles] = await Promise.all([
    db
      .from("vfd_sandbox_clients")
      .select(
        "user_id, full_name, tier, account_status, kyc_review_status, kyc_review_reason, kyc_reviewed_at, kyc_requested_tier",
      )
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    loadProfiles(db, userIds),
  ]);

  const clientMap = new Map(
    ((clients || []) as Partial<ClientRow>[]).map((c) => [c.user_id as string, c]),
  );

  const submissions = userIds.map((uid) => {
    const userDocs = rows.filter((d) => d.user_id === uid);
    const client = clientMap.get(uid) || {};
    const profile = profiles.get(uid) || {};
    const reviewStatus =
      (client.kyc_review_status && client.kyc_review_status !== "not_required"
        ? client.kyc_review_status
        : userDocs.every((d) => d.verification_status === "approved")
        ? "approved"
        : userDocs.some((d) => d.verification_status === "rejected")
        ? "rejected"
        : "pending") as string;

    return {
      user_id: uid,
      full_name: (profile.full_name as string) || client.full_name || null,
      username: (profile.username as string) || null,
      email: (profile.email as string) || null,
      submitted_at: userDocs[0]?.uploaded_at || null,
      document_types: userDocs.map((d) => d.document_type),
      document_count: userDocs.length,
      current_tier: client.tier || null,
      requested_tier: client.kyc_requested_tier ?? ((Math.max(...userDocs.map((d) => d.tier_level || 0), 0)) || null),
      account_status: client.account_status || null,
      review_status: reviewStatus,
      review_reason: client.kyc_review_reason || null,
      reviewed_at: client.kyc_reviewed_at || null,
    };
  });

  const filtered = status === "all" ? submissions : submissions.filter((s) => s.review_status === status);

  return json({
    submissions: filtered,
    counts: {
      pending: submissions.filter((s) => s.review_status === "pending").length,
      approved: submissions.filter((s) => s.review_status === "approved").length,
      rejected: submissions.filter((s) => s.review_status === "rejected").length,
    },
  });
}

async function getDetail(db: Db, userId: string) {
  const [{ data: docs }, { data: client }, profiles] = await Promise.all([
    db
      .from("vfd_sandbox_kyc_documents")
      .select("*")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: true }),
    db.from("vfd_sandbox_clients").select("*").eq("user_id", userId).maybeSingle(),
    loadProfiles(db, [userId]),
  ]);

  const rows = (docs || []) as DocRow[];

  const documents = await Promise.all(
    rows.map(async (d) => {
      const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(d.file_path, SIGNED_URL_TTL);
      return {
        id: d.id,
        document_type: d.document_type,
        file_name: d.file_name,
        mime_type: d.mime_type,
        file_size: d.file_size,
        tier_level: d.tier_level,
        uploaded_at: d.uploaded_at,
        verification_status: d.verification_status,
        rejection_reason: d.rejection_reason,
        reviewed_at: d.reviewed_at,
        signed_url: signed?.signedUrl ?? null,
      };
    }),
  );

  const c = (client || {}) as Partial<ClientRow>;
  const profile = profiles.get(userId) || {};

  let reviewerName: string | null = null;
  if (c.kyc_reviewed_by) {
    const { data: reviewer } = await db
      .from("profiles")
      .select("full_name, email")
      .eq("id", c.kyc_reviewed_by)
      .maybeSingle();
    reviewerName = (reviewer?.full_name as string) || (reviewer?.email as string) || null;
  }

  return json({
    customer: {
      user_id: userId,
      full_name: (profile.full_name as string) || c.full_name || null,
      username: (profile.username as string) || null,
      email: (profile.email as string) || null,
      bvn: c.bvn ?? null,
      nin: c.nin ?? null,
      phone: c.phone ?? null,
      gender: c.gender ?? null,
      date_of_birth: c.date_of_birth ?? null,
      address: c.address ?? null,
      tier: c.tier ?? null,
      requested_tier: c.kyc_requested_tier ?? ((Math.max(...rows.map((d) => d.tier_level || 0), 0)) || null),
      vfd_account_number: c.vfd_account_number ?? null,
      account_status: c.account_status ?? null,
      kyc_review_status: c.kyc_review_status ?? "pending",
      kyc_review_reason: c.kyc_review_reason ?? null,
      kyc_reviewed_at: c.kyc_reviewed_at ?? null,
      reviewed_by_name: reviewerName,
    },
    documents,
  });
}

async function notifyCustomer(
  db: Db,
  userId: string,
  title: string,
  message: string,
  type: string,
  details?: { label: string; value: string }[],
) {
  await db.rpc("insert_user_notification", {
    _user_id: userId,
    _title: title,
    _message: message,
    _notification_type: type,
  });

  const { data: profile } = await db
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.email) {
    await sendBrandedEmail({
      recipientEmail: profile.email as string,
      recipientName: (profile.full_name as string) || undefined,
      title,
      message,
      details,
      actionUrl: "https://app.vestara.ng/dashboard",
      actionLabel: "Open Vestara",
      idempotencyKey: `kyc-${type}-${userId}-${Date.now()}`,
    });
  }
}

async function approve(
  db: Db,
  adminId: string,
  userId: string,
  note: string | null,
  authHeader: string,
) {
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from("vfd_sandbox_clients")
    .select("kyc_requested_tier, tier, account_status, kyc_pending_upgrade")
    .eq("user_id", userId)
    .maybeSingle();

  const requested = (existing?.kyc_requested_tier as number | null) ?? null;
  const currentTierNum = Number(String(existing?.tier || "tier1").replace(/\D/g, "")) || 1;
  const needsTierUpgrade = !!requested && requested > currentTierNum;

  // Apply the upgrade at the banking provider FIRST — the tier only moves on success.
  if (needsTierUpgrade) {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/vfd-banking`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin_apply_tier_upgrade", target_user_id: userId }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json(
        { error: payload?.error || "The upgrade could not be completed with the bank. Nothing was changed." },
        502,
      );
    }
  }

  const { error: docErr } = await db
    .from("vfd_sandbox_kyc_documents")
    .update({
      verification_status: "approved",
      verified_at: now,
      reviewed_by: adminId,
      reviewed_at: now,
      rejection_reason: null,
    })
    .eq("user_id", userId);
  if (docErr) return json({ error: docErr.message }, 500);

  const { error: clientErr } = await db
    .from("vfd_sandbox_clients")
    .update({
      kyc_review_status: "approved",
      kyc_review_reason: note,
      kyc_reviewed_by: adminId,
      kyc_reviewed_at: now,
      kyc_pending_upgrade: null,
      ...(existing?.account_status === "pending" ? { account_status: "active" } : {}),
    })
    .eq("user_id", userId);
  if (clientErr) return json({ error: clientErr.message }, 500);

  await db.rpc("log_audit_event", {
    _user_id: adminId,
    _action: "kyc_approved",
    _resource_type: "vfd_sandbox_clients",
    _resource_id: userId,
    _details: { note, upgraded_to_tier: needsTierUpgrade ? requested : null },
  });

  await notifyCustomer(
    db,
    userId,
    "Identity verification approved",
    "Your documents have been verified. Your upgraded account limits and full platform access are now active.",
    "kyc_approved",
  );

  return json({ success: true, status: "approved" });
}

async function reject(db: Db, adminId: string, userId: string, reason: string) {
  const now = new Date().toISOString();

  const { error: docErr } = await db
    .from("vfd_sandbox_kyc_documents")
    .update({
      verification_status: "rejected",
      reviewed_by: adminId,
      reviewed_at: now,
      rejection_reason: reason,
    })
    .eq("user_id", userId);
  if (docErr) return json({ error: docErr.message }, 500);

  // Roll the customer back to the tier they held before requesting the upgrade.
  const { data: existing } = await db
    .from("vfd_sandbox_clients")
    .select("tier, kyc_previous_tier, kyc_requested_tier")
    .eq("user_id", userId)
    .maybeSingle();

  const currentTierNum = Number(String(existing?.tier || "tier1").replace(/\D/g, "")) || 1;
  const previousTier = (existing?.kyc_previous_tier as number | null) ?? null;
  const revertTier = previousTier && previousTier < currentTierNum ? `tier${previousTier}` : null;

  const { error: clientErr } = await db
    .from("vfd_sandbox_clients")
    .update({
      kyc_review_status: "rejected",
      kyc_review_reason: reason,
      kyc_reviewed_by: adminId,
      kyc_reviewed_at: now,
      kyc_pending_upgrade: null,
      ...(revertTier ? { tier: revertTier } : {}),
    })
    .eq("user_id", userId);
  if (clientErr) return json({ error: clientErr.message }, 500);

  await db.rpc("log_audit_event", {
    _user_id: adminId,
    _action: "kyc_rejected",
    _resource_type: "vfd_sandbox_clients",
    _resource_id: userId,
    _details: { reason, reverted_tier: revertTier, requested_tier: existing?.kyc_requested_tier ?? null },
  });

  await notifyCustomer(
    db,
    userId,
    "Identity verification needs attention",
    "We could not verify the documents you submitted. Please upload clearer or updated documents to continue your upgrade.",
    "kyc_rejected",
    [{ label: "Reason", value: reason }],
  );

  return json({ success: true, status: "rejected" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Validate the caller's JWT with the anon client.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (userErr || !caller) {
      return json({ error: "Unauthorized" }, 401);
    }

    const db = createClient(supabaseUrl, serviceKey);

    const { data: isAdmin } = await db.rpc("is_any_admin", { _user_id: caller.id });
    if (isAdmin !== true) {
      return json({ error: "Admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    const can = async (permission: string) => {
      const { data } = await db.rpc("has_permission", { _user_id: caller.id, _permission: permission });
      return data === true;
    };

    if (action === "list_submissions") {
      if (!(await can("compliance.view"))) {
        return json({ error: "You do not have permission to review KYC submissions" }, 403);
      }
      const status = ["pending", "approved", "rejected", "all"].includes(String(body?.status))
        ? String(body.status)
        : "pending";
      return await listSubmissions(db, status);
    }

    if (action === "get_detail") {
      if (!(await can("compliance.view"))) {
        return json({ error: "You do not have permission to review KYC submissions" }, 403);
      }
      const userId = String(body?.user_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Invalid customer reference" }, 400);
      return await getDetail(db, userId);
    }

    if (action === "approve" || action === "reject") {
      if (!(await can("compliance.restrict"))) {
        return json({ error: "You do not have permission to approve or reject KYC" }, 403);
      }
      const userId = String(body?.user_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Invalid customer reference" }, 400);

      if (action === "approve") {
        const note = body?.note ? String(body.note).slice(0, 500) : null;
        return await approve(db, caller.id, userId, note);
      }

      const reason = String(body?.reason || "").trim().slice(0, 500);
      if (reason.length < 5) {
        return json({ error: "A rejection reason of at least 5 characters is required" }, 400);
      }
      return await reject(db, caller.id, userId, reason);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("admin-kyc-review error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
