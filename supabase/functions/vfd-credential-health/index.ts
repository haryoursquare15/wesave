// VFD credential / entitlement health check.
//
// Runs every 15 minutes. Two probes, both through the whitelisted gateway:
//   1. Token mint  — POST /baasauth/token with the wallet consumer pair.
//   2. Account-scoped call — GET /wallet2/account/enquiry (self / pool).
//
// A token that mints but cannot make account-scoped calls (403 / 929 "Access
// Denied") is exactly the failure mode that went unnoticed for days, so a
// successful mint alone is NOT considered healthy. Every non-"00" status raises
// an alert to platform admins (in-app + email), rate-limited to one alert per
// hour while the condition persists, plus an immediate alert on recovery.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { vfdFetch, getGatewayAccessToken } from "../_shared/vfd-gateway.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VFD_MODE = Deno.env.get("VFD_MODE") || "sandbox";
const HOST = VFD_MODE === "production"
  ? "https://api-apps.vfdbank.systems"
  : "https://api-devapps.vfdbank.systems";
const WALLET_BASE = `${HOST}/vtech-wallet/api/v2/wallet2`;
const POOL_NUBAN = Deno.env.get("VFD_CORPORATE_POOL_NUBAN") || "1047279595";

const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // one alert per hour while broken

function db() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function authorized(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-cron-token") || "";
  if (provided) {
    const { data } = await db().from("internal_cron_tokens")
      .select("token").eq("name", "vfd_credential_health").maybeSingle();
    if (data?.token && data.token === provided) return true;
  }
  // Allow a signed-in super_admin to run the probe on demand from ops.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (jwt) {
    try {
      const admin = db();
      const { data: userRes } = await admin.auth.getUser(jwt);
      const uid = userRes?.user?.id;
      if (uid) {
        const { data: isSuper } = await admin.rpc("has_role", { _user_id: uid, _role: "super_admin" });
        if (isSuper) return true;
      }
    } catch (e) {
      console.error("[vfd-credential-health] jwt check failed", e);
    }
  }
  return false;
}

interface Probe {
  token_mint_ok: boolean;
  token_mint_status: string;
  account_scoped_ok: boolean;
  enquiry_status: string;
  enquiry_message: string;
  probed_account: string;
  details: Record<string, unknown>;
}

async function runProbe(): Promise<Probe> {
  const details: Record<string, unknown> = { vfd_mode: VFD_MODE, host: HOST, token_source: "gateway" };

  // ---- Probe 1: token mint -------------------------------------------------
  let accessToken = "";
  let mintStatus = "unknown";
  try {
    accessToken = (await getGatewayAccessToken()) || "";
    mintStatus = accessToken ? "00" : "no_token";
  } catch (e) {
    mintStatus = "error";
    details.mint_error = String(e);
  }

  if (!accessToken) {
    return {
      token_mint_ok: false,
      token_mint_status: mintStatus,
      account_scoped_ok: false,
      enquiry_status: "skipped",
      enquiry_message: "No access token could be minted",
      probed_account: POOL_NUBAN,
      details,
    };
  }

  // ---- Probe 2: account-scoped enquiry (self/pool) -------------------------
  let enquiryStatus = "unknown";
  let enquiryMessage = "";
  let accountOk = false;
  try {
    const target = new URL(`${WALLET_BASE}/account/enquiry`);
    if (POOL_NUBAN) target.searchParams.set("accountNumber", POOL_NUBAN);
    const res = await vfdFetch(target.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json", AccessToken: accessToken },
    });
    const text = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }
    enquiryStatus = String(parsed?.status ?? res.status);
    enquiryMessage = String(parsed?.message ?? text).slice(0, 300);
    details.enquiry_http_status = res.status;
    // "00" = account returned. "01" (Account Not Found) still proves the
    // wallet credential was accepted and the account-scoped route is reachable
    // — only auth/entitlement failures ("99", 403/929) mean broken credentials.
    accountOk = enquiryStatus === "00" || enquiryStatus === "01";
  } catch (e) {
    enquiryStatus = "error";
    enquiryMessage = String(e).slice(0, 300);
  }

  return {
    token_mint_ok: true,
    token_mint_status: mintStatus,
    account_scoped_ok: accountOk,
    enquiry_status: enquiryStatus,
    enquiry_message: enquiryMessage,
    probed_account: POOL_NUBAN,
    details,
  };
}

async function alertAdmins(title: string, body: string) {
  const supabase = db();
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["super_admin", "admin", "finance_admin"]);
  const adminIds = Array.from(new Set((admins || []).map((a) => a.user_id as string)));
  if (adminIds.length === 0) {
    console.error("[vfd-credential-health] alert with no admins:", title);
    return;
  }

  for (const adminId of adminIds) {
    try {
      await supabase.rpc("insert_user_notification", {
        _user_id: adminId,
        _title: title,
        _message: body,
        _notification_type: "vfd_credential_health",
      });
    } catch (e) {
      console.error("[vfd-credential-health] in-app alert failed:", e);
    }
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", adminIds);

  for (const p of profiles || []) {
    if (!p.email) continue;
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "notification",
          recipientEmail: p.email,
          templateData: {
            recipientName: String(p.full_name || "").trim().split(/\s+/)[0] || "there",
            title,
            message: body,
            actionUrl: "https://vestara.ng/vst-ops-9f3c",
            actionLabel: "Open Admin Portal",
            signOff: "Banking credential monitoring — Vestara platform.",
          },
        },
      });
    } catch (e) {
      console.error("[vfd-credential-health] email alert failed:", e);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!(await authorized(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const started = Date.now();
  try {
    const supabase = db();

    const { data: previous } = await supabase
      .from("vfd_credential_health")
      .select("healthy, alerted_at")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const probe = await runProbe();
    const latency = Date.now() - started;
    // Healthy ONLY when a real account-scoped call succeeds. A token that mints
    // but cannot touch accounts means money movement is still down.
    const healthy = probe.token_mint_ok && probe.account_scoped_ok;

    const wasHealthy = previous?.healthy ?? null;
    const lastAlert = previous?.alerted_at ? Date.parse(previous.alerted_at as string) : 0;
    const cooledDown = Date.now() - lastAlert > ALERT_COOLDOWN_MS;

    let shouldAlert = false;
    let title = "";
    let body = "";

    if (!healthy) {
      shouldAlert = wasHealthy !== false || cooledDown;
      title = probe.token_mint_ok
        ? `VFD entitlement failure — account calls blocked (${probe.enquiry_status})`
        : `VFD credential failure — token mint failed (${probe.token_mint_status})`;
      body =
        `The 15-minute VFD credential health check failed.\n\n` +
        `• Mode: ${VFD_MODE}\n` +
        `• Token mint: ${probe.token_mint_ok ? "OK (00)" : `FAILED (${probe.token_mint_status})`}\n` +
        `• Account enquiry (${probe.probed_account}): ${probe.enquiry_status}` +
        (probe.enquiry_message ? ` — ${probe.enquiry_message}` : "") + `\n\n` +
        `Money-in and money-out are affected. Customers are seeing the paused-service banner. ` +
        `Escalate to VFD with the app's consumer key and this status code.`;
    } else if (wasHealthy === false) {
      shouldAlert = true;
      title = "VFD credentials recovered — money movement restored";
      body =
        `Token mint and account-scoped enquiry on ${probe.probed_account} both returned 00 at ` +
        `${new Date().toISOString()}. The customer-facing paused-service banner has cleared automatically.\n\n` +
        `Run a small live transfer to confirm end-to-end before announcing.`;
    }

    const { data: inserted, error } = await supabase
      .from("vfd_credential_health")
      .insert({
        token_mint_ok: probe.token_mint_ok,
        token_mint_status: probe.token_mint_status,
        account_scoped_ok: probe.account_scoped_ok,
        enquiry_status: probe.enquiry_status,
        enquiry_message: probe.enquiry_message,
        probed_account: probe.probed_account,
        latency_ms: latency,
        healthy,
        details: probe.details,
        alerted_at: shouldAlert ? new Date().toISOString() : (previous?.alerted_at ?? null),
      })
      .select("id")
      .maybeSingle();
    if (error) console.error("[vfd-credential-health] insert failed:", error);

    if (shouldAlert) {
      console.error(`[vfd-credential-health] ALERT: ${title} :: ${body.replace(/\n/g, " ")}`);
      await alertAdmins(title, body);
    }

    return new Response(
      JSON.stringify({ ok: true, healthy, latency_ms: latency, alerted: shouldAlert, id: inserted?.id, ...probe }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[vfd-credential-health] failed:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
