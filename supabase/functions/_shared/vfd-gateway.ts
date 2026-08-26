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
const WALLET_CREDENTIAL_ID = Deno.env.get("VFD_WALLET_CREDENTIAL_ID") || "";

const VFD_HOST_RE = /^https:\/\/api-(devapps|apps)\.vfdbank\.systems/i;

export function isVfdUrl(url: string): boolean {
  return VFD_HOST_RE.test(url);
}

/** Rewrites an absolute VFD URL into the gateway forwarding URL. */
export function toGatewayUrl(url: string): string {
  const u = new URL(url);
  return `${GATEWAY_URL}/vfd${u.pathname}${u.search}`;
}

export interface VfdFetchOptions extends RequestInit {
  /**
   * Optional idempotency key for money-moving calls (transfers, wallet
   * fund/debit/credit, bill payments, airtime). Use one UUID v4 per business
   * intent and reuse it for every retry of that intent — the gateway replays the
   * stored response instead of hitting VFD twice.
   */
  idempotencyKey?: string;
}

/**
 * Drop-in replacement for `fetch` for VFD endpoints.
 * Routes through the whitelisted gateway and attaches the shared secret.
 */
export async function vfdFetch(input: string | URL, init: VfdFetchOptions = {}): Promise<Response> {
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
  if (!GATEWAY_SECRET) {
    throw new Error("VFD_GATEWAY_SECRET is not configured");
  }
  if (GATEWAY_SECRET) headers.set("x-gateway-key", GATEWAY_SECRET);
  // VFD scopes account-level calls (wallet2 AND the direct-debit/e-mandate
  // API) to a wallet credential profile. Without this header VFD answers
  // 403 / status 99 "Invalid wallet token".
  if ((url.includes("/wallet2/") || url.includes("/vtech-mandate/")) && WALLET_CREDENTIAL_ID) {
    headers.set("wallet-credential-id", WALLET_CREDENTIAL_ID);
  }
  if (!headers.has("x-request-id")) headers.set("x-request-id", crypto.randomUUID());
  if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const target = toGatewayUrl(url);
  const targetPath = new URL(target).pathname;
  console.log(`[vfd-gateway] ${init.method || "GET"} ${targetPath}`);

  // TEMP DEBUG: wallet-credential-id visibility on account-scoped calls.
  // Never logs AccessToken, consumer keys, or the gateway secret.
  if (targetPath.includes("/wallet2/account/enquiry") || targetPath.includes("/directdebit/")) {
    const wcid = headers.get("wallet-credential-id");
    console.log(
      `[vfd-gateway][debug] path=${targetPath} wallet-credential-id_present=${!!wcid} value=${wcid ?? "(none)"}`,
    );
  }

  return fetch(target, { ...init, headers });
}

/**
 * True when the gateway could not confirm the outcome of a financial request
 * (lost response / upstream timeout). The transaction may or may not have been
 * executed by VFD — NEVER auto-retry it. Run a transaction-status inquiry or
 * leave it to the reconciler before attempting another debit or transfer.
 *
 * Shape returned by the gateway:
 *   HTTP 409 + { transaction_status: "unknown", action_required: "transaction_status_inquiry" }
 */
export function isUncertainTransaction(
  status: number,
  body: unknown,
): boolean {
  if (status !== 409) return false;
  const b = body as { transaction_status?: string } | null;
  return b?.transaction_status === "unknown";
}

/** True when the gateway's circuit breaker is open (VFD outage, fail-fast). */
export function isCircuitOpen(res: Response): boolean {
  return res.status === 503 && res.headers.get("x-circuit-state") === "OPEN";
}

/**
 * Obtains a VFD access token. The gateway mints it using credentials that live
 * only on the droplet, so no consumer key/secret is needed in edge functions.
 */
export async function getGatewayAccessToken(): Promise<string | null> {
  if (!GATEWAY_URL) throw new Error("VFD_GATEWAY_URL is not configured");
  if (!GATEWAY_SECRET) throw new Error("VFD_GATEWAY_SECRET is not configured");
  const requestId = crypto.randomUUID();
  try {
    const res = await fetch(`${GATEWAY_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-key": GATEWAY_SECRET,
        "x-request-id": requestId,
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const upstreamRequestId = res.headers.get("x-request-id") || requestId;
      console.error(`[vfd-gateway] token request failed status=${res.status} request_id=${upstreamRequestId}`);
      if (res.status === 401 || res.status === 403) {
        throw new Error(`VFD gateway authentication failed (request ${upstreamRequestId})`);
      }
      throw new Error(`VFD gateway token request failed with HTTP ${res.status} (request ${upstreamRequestId})`);
    }
    const token = (data as { access_token?: string } | null)?.access_token;
    if (!token) throw new Error(`VFD gateway returned no access token (request ${requestId})`);
    return token;
  } catch (err) {
    console.error("[vfd-gateway] token mint failed", err);
    throw err;
  }
}
