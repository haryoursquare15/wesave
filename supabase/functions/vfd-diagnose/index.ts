// Temporary diagnostic: compares gateway-minted vs locally-minted tokens on
// account-scoped wallet2 calls. Protected by the credential-health cron token.
// rev: wallet-credential-id debug logging (temporary)
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
const AUTH_URL = `${HOST}/vfd-tech/baas-portal/v1.1/baasauth/token`;
const POOL = Deno.env.get("VFD_CORPORATE_POOL_NUBAN") || "1047279595";

async function localToken(): Promise<string | null> {
  const res = await vfdFetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consumerKey: Deno.env.get("VFD_CONSUMER_KEY") || "",
      consumerSecret: Deno.env.get("VFD_CONSUMER_SECRET") || "",
      validityTime: "1",
    }),
  });
  const body = await res.json().catch(() => null);
  return body?.data?.access_token ?? null;
}

async function probe(label: string, url: string, token: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.AccessToken = token;
  // TEMP DEBUG: never log AccessToken/credentials — only path + wallet-credential-id presence.
  const debugPath = new URL(url).pathname;
  // The wallet-credential-id header is injected inside vfdFetch from
  // VFD_WALLET_CREDENTIAL_ID; report the configured value here (non-secret).
  const wcid = debugPath.includes("/wallet2/")
    ? (Deno.env.get("VFD_WALLET_CREDENTIAL_ID") || null)
    : null;

  const res = await vfdFetch(url, { method: "GET", headers });
  const text = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(text); } catch { /* raw */ }
  return {
    label,
    http: res.status,
    status: parsed?.status ?? null,
    message: String(parsed?.message ?? text).slice(0, 300),
    debug: { path: debugPath, wallet_credential_id_present: !!wcid, wallet_credential_id: wcid ?? "(none)" },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const provided = req.headers.get("x-cron-token") || "";
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: tok } = await db.from("internal_cron_tokens")
    .select("token").eq("name", "vfd_credential_health").maybeSingle();
  if (!provided || provided !== tok?.token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: unknown[] = [];
  try {
    const requestBody = req.method === "POST"
      ? await req.json().catch(() => ({})) as { accountNumber?: string }
      : {};
    const accountNumber = requestBody.accountNumber || POOL;
    const gwToken = await getGatewayAccessToken().catch((e) => { results.push({ label: "gateway_token", error: String(e) }); return null; });
    const lcToken = await localToken().catch((e) => { results.push({ label: "local_token", error: String(e) }); return null; });
    results.push({ label: "tokens", gateway: gwToken ? "minted" : "none", local: lcToken ? "minted" : "none", same: gwToken === lcToken });

    const enquiry = `${WALLET_BASE}/account/enquiry?accountNumber=${encodeURIComponent(accountNumber)}`;
    if (gwToken) results.push(await probe("enquiry_pool_gateway_token", enquiry, gwToken));
    if (lcToken) results.push(await probe("enquiry_pool_local_token", enquiry, lcToken));
    if (gwToken) results.push(await probe("enquiry_self_gateway_token", `${WALLET_BASE}/account/enquiry`, gwToken));
    if (gwToken) results.push(await probe("bank_list_gateway_token", `${WALLET_BASE}/bank`, gwToken));
    // No AccessToken at all — does the gateway inject its own wallet auth?
    results.push(await probe("enquiry_pool_no_token", enquiry, null));
    // Gateway self-report: is the wallet credential configured on the droplet?
    const gwUrl = (Deno.env.get("VFD_GATEWAY_URL") || "").replace(/\/+$/, "");
    const gwSecret = Deno.env.get("VFD_GATEWAY_SECRET") || "";
    for (const path of ["/health", "/status", "/config"]) {
      try {
        const r = await fetch(`${gwUrl}${path}`, { headers: { "x-gateway-key": gwSecret } });
        const t = (await r.text()).slice(0, 400);
        results.push({ label: `gateway${path}`, http: r.status, message: t });
      } catch (e) {
        results.push({ label: `gateway${path}`, error: String(e).slice(0, 200) });
      }
    }
  } catch (e) {
    results.push({ error: String(e) });
  }

  return new Response(JSON.stringify({ mode: VFD_MODE, pool: POOL, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
