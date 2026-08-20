// Shared VFD Direct-Debit / E-Mandate client.
//
// Every call leaves through the whitelisted VFD gateway (`vfdFetch`). No
// credentials are held here beyond reading edge function secrets.
//
// Documented endpoints (production host, api-apps):
//   POST {base}/mandate/setup?e-mandate=true   -> create e-mandate
//   GET  {base}/mandate/status?reference=...   -> mandate approval status
//   POST {base}/account/debit                  -> debit an approved mandate
import { vfdFetch, getGatewayAccessToken } from "./vfd-gateway.ts";

const MANDATE_API_PATH = "/vtech-mandate/api/v2/directdebit";

export const VFD_IS_PRODUCTION =
  (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase() === "production";

export const VFD_HOST = VFD_IS_PRODUCTION
  ? "https://api-apps.vfdbank.systems"
  : "https://api-devapps.vfdbank.systems";

export const VFD_MANDATE_BASE = (() => {
  const configured = Deno.env.get("VFD_BASE_URL") || Deno.env.get("VFD_MANDATE_BASE");
  if (!configured) return VFD_HOST + MANDATE_API_PATH;
  const trimmed = configured.replace(/\/+$/, "");
  return trimmed.includes("/directdebit")
    ? trimmed
    : trimmed.replace(/\/vtech-[^/]+\/.*$/, "") + MANDATE_API_PATH;
})();

export const VFD_MANDATE_CREATE_PATH = "/mandate/setup?e-mandate=true";

/** Single Vestara corporate pool NUBAN — receiver of EVERY mandate debit. */
export const VFD_POOL_NUBAN = (() => {
  const configured =
    Deno.env.get("VFD_MANDATE_RECEIVER_ACCOUNT") ||
    Deno.env.get("VFD_CORPORATE_ACCOUNT_NUMBER") ||
    Deno.env.get("VFD_POOL_NUBAN") ||
    "1047279595";
  // Legacy WeSave pool is decommissioned — never send mandates to it.
  return configured.trim() === "1001695610" ? "1047279595" : configured.trim();
})();

export const VFD_POOL_BANK_CODE =
  Deno.env.get("VFD_CORPORATE_BANK_CODE") || Deno.env.get("VFD_POOL_BANK_CODE") || "999999";

/**
 * Sandbox-only auto-approval switch. MUST be unset/false in production; the
 * engine refuses to honour it whenever VFD_MODE=production.
 */
export const MANDATE_TEST_MODE =
  !VFD_IS_PRODUCTION && (Deno.env.get("MANDATE_TEST_MODE") || "").toLowerCase() === "true";

export const MANDATE_SETUP_FEE = 100;
export const MANDATE_NIBSS_SHARE = 50;
export const MANDATE_INTERNAL_SHARE = MANDATE_SETUP_FEE - MANDATE_NIBSS_SHARE;
export const MANDATE_MIN_AMOUNT = 1000;
export const MANDATE_EXPIRY_DAYS = 7;

export interface MandatePayer {
  bankCode: string;
  accountNumber: string;
  phone: string;
  email: string;
  address: string;
}

export function formatVfdMandateDate(d: Date): string {
  const months = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  return `${String(d.getUTCDate()).padStart(2, "0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** daily=1, weekly=2, monthly=3 */
export function mapFrequencyToVfd(period: string): string {
  const p = (period || "").toLowerCase();
  if (p === "daily" || p === "1") return "1";
  if (p === "weekly" || p === "2") return "2";
  return "3";
}

export function addCycles(from: Date, frequency: string, cycles: number): Date {
  const d = new Date(from);
  if (frequency === "1") d.setUTCDate(d.getUTCDate() + cycles);
  else if (frequency === "2") d.setUTCDate(d.getUTCDate() + cycles * 7);
  else d.setUTCMonth(d.getUTCMonth() + cycles);
  return d;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function mintMandateCredentialToken(): Promise<string | null> {
  // VFD confirmed e-mandate is entitled on the SAME consumer key/secret pair as
  // every other BaaS call — mandate-specific vars are only an override.
  const consumerKey = Deno.env.get("VFD_MANDATE_CONSUMER_KEY") || Deno.env.get("VFD_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("VFD_MANDATE_CONSUMER_SECRET") || Deno.env.get("VFD_CONSUMER_SECRET");
  if (!consumerKey || !consumerSecret) return null;
  const res = await vfdFetch(`${VFD_HOST}/vfd-tech/baas-portal/v1.1/baasauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "-1" }),
  });
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  const data = ((json as Record<string, any>)?.data || {}) as Record<string, unknown>;
  return String(
    data.access_token || data.accessToken || data.token ||
    (json as Record<string, any>)?.access_token || "",
  ) || null;
}

/**
 * Probe the e-mandate SETUP endpoint with a deliberately incomplete payload.
 * A validation complaint proves the token authenticated; 401/403 proves it did
 * not. No mandate can be created from this payload and no money moves.
 */
async function tokenIsAccepted(accessToken: string, source: string): Promise<boolean> {
  try {
    const res = await vfdFetch(`${VFD_MANDATE_BASE}${VFD_MANDATE_CREATE_PATH}`, {
      method: "POST",
      headers: { AccessToken: accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ mandateReference: `vestara-token-check-${crypto.randomUUID()}` }),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const message = String((json as Record<string, any>)?.message || (json as Record<string, any>)?.error || "");
    const accepted = res.status !== 401 && res.status !== 403 &&
      !/invalid wallet token|invalid token|unauthori[sz]ed|contact admin/i.test(message);
    console.info(`[mandate-auth] source=${source} status=${res.status} accepted=${accepted}`);
    return accepted;
  } catch (e) {
    console.error("[mandate-auth] probe failed", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function getMandateAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  cachedToken = null;
  const candidates: Array<{ source: string; token: string | null }> = [
    { source: "mandate_credentials", token: await mintMandateCredentialToken().catch(() => null) },
    { source: "gateway_wallet", token: await getGatewayAccessToken().catch(() => null) },
    { source: "configured_access_token", token: Deno.env.get("VFD_ACCESS_TOKEN") || null },
  ];
  const tested = new Set<string>();
  for (const c of candidates) {
    if (!c.token || tested.has(c.token)) continue;
    tested.add(c.token);
    if (await tokenIsAccepted(c.token, c.source)) {
      cachedToken = { token: c.token, expiresAt: Date.now() + 4 * 60 * 1000 };
      return c.token;
    }
  }
  console.error("[mandate-auth] VFD rejected every configured mandate token");
  return null;
}

function extractNibssAccount(message: string): string {
  const m = (message || "").match(/\b(\d{10})\b/);
  return m ? m[1] : "";
}

export interface MandateCreateResult {
  created: boolean;
  mandateCode: string;
  nibssAccount: string;
  nibssMessage: string;
  raw: Record<string, unknown>;
}

/** Stage 1 — create the e-mandate at VFD. */
export async function createMandate(opts: {
  reference: string;
  payer: MandatePayer;
  amount: number;
  frequency: string;
  startDate: Date;
  endDate: Date;
}): Promise<MandateCreateResult> {
  const accessToken = await getMandateAccessToken();
  const payload = {
    reference: opts.reference,
    payerBank: opts.payer.bankCode,
    payerAccountNumber: opts.payer.accountNumber,
    payerPhone: opts.payer.phone,
    payerEmailAddress: opts.payer.email,
    payerAddress: opts.payer.address,
    receiverBank: VFD_POOL_BANK_CODE,
    receiverAccountNumber: VFD_POOL_NUBAN,
    amount: String(Math.max(MANDATE_MIN_AMOUNT, Math.round(opts.amount))),
    startDate: formatVfdMandateDate(opts.startDate),
    endDate: formatVfdMandateDate(opts.endDate),
    frequency: opts.frequency,
  };
  if (!accessToken) {
    return { created: false, mandateCode: "", nibssAccount: "", nibssMessage: "",
      raw: { step: "create", request: payload, error: "MANDATE_AUTH_FAILED" } };
  }
  try {
    const res = await vfdFetch(`${VFD_MANDATE_BASE}${VFD_MANDATE_CREATE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessToken: accessToken },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const data = ((json as Record<string, any>)?.data || {}) as Record<string, unknown>;
    const mandateCode = String(data.mandateCode || data.mandateId || data.reference || "");
    const nibssMessage = String(data.message || (json as Record<string, any>)?.message || "");
    const nibssAccount = String(
      data.nibssAccount || data.accountNumber || data.account || data.virtualAccountNumber || "",
    ) || extractNibssAccount(nibssMessage);
    const status = String((json as Record<string, any>)?.status || "");
    // An empty / undocumented body is NEVER a created mandate.
    const created = (status === "00" || res.status === 202) && !!(mandateCode || nibssAccount);
    return { created, mandateCode, nibssAccount, nibssMessage,
      raw: { step: "create", request: payload, response: json, http_status: res.status } };
  } catch (e) {
    return { created: false, mandateCode: "", nibssAccount: "", nibssMessage: "",
      raw: { step: "create", request: payload, error: e instanceof Error ? e.message : String(e) } };
  }
}

export interface MandateStatusResult {
  approved: boolean;
  rejected: boolean;
  status: string;
  raw: Record<string, unknown>;
  http_status: number;
}

/** Stage 2 — poll MANDATE-APPROVAL-STATUS using the creation reference. */
export async function checkMandateApproval(reference: string): Promise<MandateStatusResult> {
  const accessToken = await getMandateAccessToken();
  if (!accessToken) {
    return { approved: false, rejected: false, status: "AUTH_FAILED", raw: { error: "MANDATE_AUTH_FAILED" }, http_status: 0 };
  }
  try {
    const res = await vfdFetch(
      `${VFD_MANDATE_BASE}/mandate/status?reference=${encodeURIComponent(reference)}`,
      { method: "GET", headers: { AccessToken: accessToken } },
    );
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const data = ((json as Record<string, any>)?.data || {}) as Record<string, any>;
    const desc = String(
      data.mandateWorkflowStatusDescription || data.mandateWorkflowStatus || data.mandateState || "",
    );
    const approved = /bank.?approved|approved/i.test(desc) ||
      String(data.mandateState || "").toUpperCase() === "ACTIVE";
    const rejected = /reject|decline|cancel|revok/i.test(desc);
    return { approved, rejected, status: desc || String((json as Record<string, any>)?.message || "Unknown"), raw: json, http_status: res.status };
  } catch (e) {
    return { approved: false, rejected: false, status: "ERROR", raw: { error: e instanceof Error ? e.message : String(e) }, http_status: 0 };
  }
}

export interface MandateDebitResult {
  ok: boolean;
  raw: Record<string, unknown>;
  http_status: number;
  failureClass: "none" | "insufficient_funds" | "mandate_revoked" | "auth" | "bank_error";
  message: string;
}

function classifyDebitFailure(message: string, httpStatus: number): MandateDebitResult["failureClass"] {
  const m = (message || "").toLowerCase();
  if (/insufficient|balance|funds/.test(m)) return "insufficient_funds";
  if (/revok|cancel|inactive|not\s*active|mandate.*(invalid|expired)/.test(m)) return "mandate_revoked";
  if (httpStatus === 401 || httpStatus === 403 || /invalid wallet token|unauthori[sz]ed/.test(m)) return "auth";
  return "bank_error";
}

/**
 * Stage 3 — debit an approved mandate. `transactionReference` MUST be the
 * caller's idempotency-bound reference; it is also passed to the gateway as the
 * idempotency key so a network retry can never double-charge at VFD.
 */
export async function debitMandate(params: {
  mandateReference: string;
  amount: number;
  narration: string;
  transactionReference: string;
  idempotencyKey: string;
}): Promise<MandateDebitResult> {
  const accessToken = await getMandateAccessToken();
  const payload = {
    amount: String(params.amount),
    narration: params.narration,
    mandateReference: params.mandateReference,
    transactionReference: params.transactionReference,
  };
  if (!accessToken) {
    return { ok: false, raw: { request: payload, error: "MANDATE_AUTH_FAILED" }, http_status: 0,
      failureClass: "auth", message: "Mandate provider authentication failed" };
  }
  try {
    const res = await vfdFetch(`${VFD_MANDATE_BASE}/account/debit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessToken: accessToken },
      body: JSON.stringify(payload),
      idempotencyKey: params.idempotencyKey,
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const status = String((json as Record<string, any>)?.status || "");
    const message = String((json as Record<string, any>)?.message || (json as Record<string, any>)?.error || "");
    // Only an explicit VFD success code counts as a confirmed debit.
    const ok = status === "00";
    return {
      ok,
      raw: { request: payload, response: json, http_status: res.status },
      http_status: res.status,
      failureClass: ok ? "none" : classifyDebitFailure(message, res.status),
      message: message || (ok ? "Successful" : "Debit not confirmed by VFD"),
    };
  } catch (e) {
    return { ok: false, raw: { request: payload, error: e instanceof Error ? e.message : String(e) }, http_status: 0,
      failureClass: "bank_error", message: e instanceof Error ? e.message : String(e) };
  }
}
