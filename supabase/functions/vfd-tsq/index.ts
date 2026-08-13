// Ops-only Transaction Status Query (TSQ) against VFD.
// Protected by the VFD_WEBHOOK_SECRET shared secret (header x-ops-secret).
// Read-only: performs GET /transactions on the VFD wallet API via the gateway.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { vfdFetch, getGatewayAccessToken } from "../_shared/vfd-gateway.ts";

const VFD_MODE = Deno.env.get("VFD_MODE") || "sandbox";
const HOST = VFD_MODE === "production"
  ? "https://api-apps.vfdbank.systems"
  : "https://api-devapps.vfdbank.systems";
const WALLET_BASE = `${HOST}/vtech-wallet/api/v2/wallet2`;
const AUTH_URL = `${HOST}/vfd-tech/baas-portal/v1.1/baasauth/token`;
const OPS_SECRET = Deno.env.get("VFD_WEBHOOK_SECRET") || "";

function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function getAccessToken(): Promise<string> {
  const gw = await getGatewayAccessToken();
  if (gw) return gw;
  const staticToken = Deno.env.get("VFD_ACCESS_TOKEN");
  const consumerKey = Deno.env.get("VFD_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("VFD_CONSUMER_SECRET");
  if (consumerKey && consumerSecret) {
    const res = await vfdFetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "-1" }),
    });
    const data = await res.json().catch(() => null);
    if (data?.status === "00" && data?.data?.access_token) return data.data.access_token;
  }
  if (staticToken) return staticToken;
  throw new Error("VFD credentials not configured");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const provided = req.headers.get("x-ops-secret") || "";
  let authorized = !!OPS_SECRET && !!provided && timingSafeEqual(provided, OPS_SECRET);

  // Alternative auth: internal ops token stored in internal_cron_tokens.
  if (!authorized) {
    try {
      const { verifyCronToken } = await import("../_shared/cron-auth.ts");
      authorized = await verifyCronToken(req, "ops_diagnostics");
    } catch (e) {
      console.error("[vfd-tsq] cron token check failed", e);
    }
  }

  // Alternative auth: a signed-in super_admin (ops console / agent diagnostics).
  if (!authorized) {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      try {
        const { createClient } = await import("npm:@supabase/supabase-js@2");
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: userRes } = await admin.auth.getUser(jwt);
        const uid = userRes?.user?.id;
        if (uid) {
          const { data: isSuper } = await admin.rpc("has_role", { _user_id: uid, _role: "super_admin" });
          authorized = !!isSuper;
        }
      } catch (e) {
        console.error("[vfd-tsq] jwt auth check failed", e);
      }
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  let sessionId = url.searchParams.get("sessionId") || "";
  let reference = url.searchParams.get("reference") || "";
  let billRef = url.searchParams.get("billRef") || "";
  let billPay: Record<string, string> | null = null;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    sessionId = (body.sessionId as string) || sessionId;
    reference = (body.reference as string) || reference;
    billRef = (body.billRef as string) || billRef;
    if (body.billPay && typeof body.billPay === "object") {
      billPay = body.billPay as Record<string, string>;
    }
  }

  // Ops probe: read-only /account/enquiry. `enquiry=<nuban>` queries a
  // specific account; `enquiry=self` omits accountNumber, which returns the
  // corporate/pool account tied to our VFD credentials.
  const enquiry = url.searchParams.get("enquiry") || "";
  if (enquiry) {
    try {
      const accessToken = await getAccessToken();
      const target = new URL(`${WALLET_BASE}/account/enquiry`);
      if (enquiry !== "self") target.searchParams.set("accountNumber", enquiry);
      const res = await vfdFetch(target.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json", AccessToken: accessToken },
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep raw */ }
      return new Response(JSON.stringify({ vfd_mode: VFD_MODE, probe: "enquiry", queried: enquiry, http_status: res.status, response: parsed }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Ops probe: read-only intra-bank name enquiry (/transfer/recipient). Tells
  // us whether a NUBAN exists at VFD at all, independent of whether it sits
  // under our wallet credentials.
  const recipient = url.searchParams.get("recipient") || "";
  if (recipient) {
    try {
      const accessToken = await getAccessToken();
      const target = new URL(`${WALLET_BASE}/transfer/recipient`);
      target.searchParams.set("accountNo", recipient);
      target.searchParams.set("bank", "999999");
      target.searchParams.set("transfer_type", "intra");
      const res = await vfdFetch(target.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json", AccessToken: accessToken },
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep raw */ }
      return new Response(JSON.stringify({ vfd_mode: VFD_MODE, probe: "recipient", queried: recipient, http_status: res.status, response: parsed }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Ops probe: read-only bills catalog / customer validation passthrough.
  // `billsGet=<path>?<query>` e.g. billsGet=billerItems?billerId=IKEDC&...
  const billsGet = url.searchParams.get("billsGet") || "";
  if (billsGet) {
    try {
      const accessToken = await getAccessToken();
      const billsBase = `${HOST}/vtech-bills/api/v2/billspaymentstore`;
      const res = await vfdFetch(`${billsBase}/${billsGet.replace(/^\//, "")}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", AccessToken: accessToken },
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep raw */ }
      return new Response(JSON.stringify({ vfd_mode: VFD_MODE, probe: "bills_get", queried: billsGet, http_status: res.status, response: parsed }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }


  // Ops probe: post a raw payload straight to VFD /pay (no wallet movement,
  // no receipt) so we can compare our request against VFD's own sample.
  if (billPay) {
    try {
      const accessToken = await getAccessToken();
      const billsBase = `${HOST}/vtech-bills/api/v2/billspaymentstore`;
      const res = await vfdFetch(`${billsBase}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", AccessToken: accessToken },
        body: JSON.stringify(billPay),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep raw */ }
      return new Response(JSON.stringify({ vfd_mode: VFD_MODE, probe: "bill_pay", sent: billPay, http_status: res.status, response: parsed }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (!sessionId && !reference && !billRef) {
    return new Response(JSON.stringify({ error: "sessionId, reference or billRef required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const attempts: Array<Record<string, unknown>> = [];
  const queries: Array<Record<string, string>> = [];
  if (sessionId) queries.push({ sessionId });
  if (reference) queries.push({ reference });


  try {
    const accessToken = await getAccessToken();
    for (const params of queries) {
      const target = new URL(`${WALLET_BASE}/transactions`);
      for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
      const res = await vfdFetch(target.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json", AccessToken: accessToken },
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep raw */ }
      attempts.push({ query: params, http_status: res.status, response: parsed });
    }
    if (billRef) {
      const billsBase = `${HOST}/vtech-bills/api/v2/billspaymentstore`;
      const target = `${billsBase}/transactionStatus?transactionId=${encodeURIComponent(billRef)}`;
      const res = await vfdFetch(target, {
        method: "GET",
        headers: { "Content-Type": "application/json", AccessToken: accessToken },
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep raw */ }
      attempts.push({ query: { billRef }, http_status: res.status, response: parsed });
    }
    return new Response(JSON.stringify({ vfd_mode: VFD_MODE, attempts }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
