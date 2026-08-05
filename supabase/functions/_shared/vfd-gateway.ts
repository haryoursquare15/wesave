// Shared VFD egress client.
//
// All VFD traffic MUST leave through the Vestara VFD Gateway hosted on the
// DigitalOcean droplet whose static IPv4 is whitelisted by VFD. Edge functions
// never talk to *.vfdbank.systems directly and never hold VFD credentials.
//
// Env (edge function secrets):
//   VFD_GATEWAY_URL     e.g. https://vfd-gw.vestara.ng
//   VFD_GATEWAY_SECRET  shared secret, sent as x-gateway-key
//   VFD_ALLOW_DIRECT    "true" only for local/dev fallback (NOT for production)

const GATEWAY_URL = (Deno.env.get("VFD_GATEWAY_URL") || "").replace(/\/+$/, "");
const GATEWAY_SECRET = Deno.env.get("VFD_GATEWAY_SECRET") || "";
const ALLOW_DIRECT = (Deno.env.get("VFD_ALLOW_DIRECT") || "").toLowerCase() === "true";

const VFD_HOST_RE = /^https:\/\/api-(devapps|apps)\.vfdbank\.systems/i;

export function isVfdUrl(url: string): boolean {
  return VFD_HOST_RE.test(url);
}

/** Rewrites an absolute VFD URL into the gateway forwarding URL. */
export function toGatewayUrl(url: string): string {
  const u = new URL(url);
  return `${GATEWAY_URL}/vfd${u.pathname}${u.search}`;
}

/**
 * Drop-in replacement for `fetch` for VFD endpoints.
 * Routes through the whitelisted gateway and attaches the shared secret.
 */
export async function vfdFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();

  if (!isVfdUrl(url)) return fetch(url, init);

  if (!GATEWAY_URL) {
    if (ALLOW_DIRECT) {
      console.warn("[vfd-gateway] VFD_GATEWAY_URL unset — falling back to direct VFD call");
      return fetch(url, init);
    }
    throw new Error(
      "VFD_GATEWAY_URL is not configured. VFD calls must route through the whitelisted gateway.",
    );
  }

  const headers = new Headers(init.headers || {});
  if (GATEWAY_SECRET) headers.set("x-gateway-key", GATEWAY_SECRET);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const target = toGatewayUrl(url);
  console.log(`[vfd-gateway] ${init.method || "GET"} ${new URL(target).pathname}`);
  return fetch(target, { ...init, headers });
}

/**
 * Obtains a VFD access token. The gateway mints it using credentials that live
 * only on the droplet, so no consumer key/secret is needed in edge functions.
 */
export async function getGatewayAccessToken(): Promise<string | null> {
  if (!GATEWAY_URL) return null;
  try {
    const res = await fetch(`${GATEWAY_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(GATEWAY_SECRET ? { "x-gateway-key": GATEWAY_SECRET } : {}),
      },
    });
    const data = await res.json().catch(() => null);
    const token = (data as { access_token?: string } | null)?.access_token;
    return token || null;
  } catch (err) {
    console.error("[vfd-gateway] token mint failed", err);
    return null;
  }
}
