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
  // The e-mandate-entitled pair wins; the older mandate/primary pairs remain
  // as fallbacks for non-entitled environments.
  const consumerKey = Deno.env.get("VFD_EMANDATE_CONSUMER_KEY") || Deno.env.get("VFD_MANDATE_CONSUMER_KEY_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_KEY") || Deno.env.get("VFD_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("VFD_EMANDATE_CONSUMER_SECRET") || Deno.env.get("VFD_MANDATE_CONSUMER_SECRET_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_SECRET") || Deno.env.get("VFD_CONSUMER_SECRET");
  if (!consumerKey || !consumerSecret) return null;

  const res = await vfdFetch(`${VFD_HOST}/vfd-tech/baas-portal/v1.1/baasauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "1" }),
  });
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  const data = ((json as Record<string, any>)?.data || {}) as Record<string, unknown>;
  return String(
    data.access_token || data.accessToken || data.token ||
    (json as Record<string, any>)?.access_token || "",
  ) || null;
}

async function mintTokenWithPair(consumerKey: string, consumerSecret: string): Promise<string | null> {
  try {
    const res = await vfdFetch(`${VFD_HOST}/vfd-tech/baas-portal/v1.1/baasauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "1" }),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const data = ((json as Record<string, any>)?.data || {}) as Record<string, unknown>;
    return String(
      data.access_token || data.accessToken || data.token ||
      (json as Record<string, any>)?.access_token || "",
    ) || null;
  } catch {
    return null;
  }
}

/**
 * Ops diagnostic: attempt to MINT a BaaS token with each configured consumer
 * pair and report VFD's verbatim auth response (status + message only, never
 * the token). This isolates "bad auth key" from "key not entitled for
 * e-mandate": a pair that cannot even mint a token is simply wrong/revoked.
 */
export async function probeCredentialMint(): Promise<Array<Record<string, unknown>>> {
  const pairs: Array<{ source: string; key?: string; secret?: string }> = [
    {
      source: "emandate_consumer_pair",
      key: Deno.env.get("VFD_EMANDATE_CONSUMER_KEY"),
      secret: Deno.env.get("VFD_EMANDATE_CONSUMER_SECRET"),
    },
    {
      source: "mandate_consumer_pair",
      key: (Deno.env.get("VFD_MANDATE_CONSUMER_KEY_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_KEY")),
      secret: (Deno.env.get("VFD_MANDATE_CONSUMER_SECRET_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_SECRET")),
    },
    {
      source: "primary_consumer_pair",
      key: Deno.env.get("VFD_CONSUMER_KEY"),
      secret: Deno.env.get("VFD_CONSUMER_SECRET"),
    },
  ];


  const out: Array<Record<string, unknown>> = [];
  for (const p of pairs) {
    if (!p.key || !p.secret) {
      out.push({ source: p.source, configured: false });
      continue;
    }
    try {
      const res = await vfdFetch(`${VFD_HOST}/vfd-tech/baas-portal/v1.1/baasauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerKey: p.key, consumerSecret: p.secret, validityTime: "1" }),
      });
      const body = await res.json().catch(() => ({} as Record<string, any>));
      const data = (body?.data || {}) as Record<string, unknown>;
      const token = String(data.access_token || data.accessToken || data.token || body?.access_token || "");
      out.push({
        source: p.source,
        configured: true,
        http_status: res.status,
        vfd_status: body?.status ?? null,
        vfd_message: body?.message ?? body?.error ?? null,
        token_minted: !!token,
        token_length: token.length,
      });
    } catch (e) {
      out.push({ source: p.source, configured: true, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/**
 * Ops diagnostic: fire the SAME real e-mandate setup payload with every token
 * source we can mint, and report VFD's verbatim answer for each. Reveals which
 * credential pair (if any) is entitled for e-mandate. Never returns a token.
 */
export async function probeMandateTokenSources(
  payload: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  const sources: Array<{ source: string; token: string | null }> = [
    {
      source: "emandate_consumer_pair",
      token: await mintTokenWithPair(
        Deno.env.get("VFD_EMANDATE_CONSUMER_KEY") || "",
        Deno.env.get("VFD_EMANDATE_CONSUMER_SECRET") || "",
      ),
    },
    {
      source: "mandate_consumer_pair",
      token: await mintTokenWithPair(
        (Deno.env.get("VFD_MANDATE_CONSUMER_KEY_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_KEY")) || "",
        (Deno.env.get("VFD_MANDATE_CONSUMER_SECRET_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_SECRET")) || "",
      ),
    },
    {
      source: "primary_consumer_pair",
      token: await mintTokenWithPair(
        Deno.env.get("VFD_CONSUMER_KEY") || "",
        Deno.env.get("VFD_CONSUMER_SECRET") || "",
      ),
    },
    { source: "gateway_wallet", token: await getGatewayAccessToken().catch(() => null) },
  ];

  const out: Array<Record<string, unknown>> = [];
  for (const s of sources) {
    if (!s.token) {
      out.push({ source: s.source, minted: false });
      continue;
    }
    try {
      const res = await vfdFetch(`${VFD_MANDATE_BASE}${VFD_MANDATE_CREATE_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", AccessToken: s.token },
        body: JSON.stringify({ ...payload, reference: `${payload.reference}-${s.source}` }),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      out.push({ source: s.source, minted: true, http_status: res.status, response: json });
    } catch (e) {
      out.push({ source: s.source, minted: true, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
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

/** Which candidate minted the token VFD accepted (diagnostics only, never the token). */
let lastTokenSource = "none";
export function getLastMandateTokenSource(): string {
  return lastTokenSource;
}

/** Every distinct token we can mint for mandate calls, best candidate first. */
export async function getMandateTokenCandidates(): Promise<Array<{ source: string; token: string }>> {
  cachedToken = null;
  const raw: Array<{ source: string; token: string | null }> = [
    { source: "emandate_credentials", token: await mintTokenWithPair(
      Deno.env.get("VFD_EMANDATE_CONSUMER_KEY") || "",
      Deno.env.get("VFD_EMANDATE_CONSUMER_SECRET") || "") },
    { source: "mandate_credentials", token: await mintTokenWithPair(
      (Deno.env.get("VFD_MANDATE_CONSUMER_KEY_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_KEY")) || "",
      (Deno.env.get("VFD_MANDATE_CONSUMER_SECRET_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_SECRET")) || "") },
    { source: "primary_credentials", token: await mintTokenWithPair(
      Deno.env.get("VFD_CONSUMER_KEY") || "",
      Deno.env.get("VFD_CONSUMER_SECRET") || "") },
    { source: "gateway_wallet", token: await getGatewayAccessToken().catch(() => null) },
  ];

  const seen = new Set<string>();
  const out: Array<{ source: string; token: string }> = [];
  for (const c of raw) {
    if (!c.token || seen.has(c.token)) continue;
    seen.add(c.token);
    out.push({ source: c.source, token: c.token });
  }
  return out;
}

/** True when VFD's answer means "this token isn't valid/entitled". */
export function isInvalidTokenResponse(httpStatus: number, body: Record<string, unknown>): boolean {
  const message = String((body as any)?.message || (body as any)?.error || "");
  return httpStatus === 401 || httpStatus === 403 ||
    /invalid wallet token|invalid token|unauthori[sz]ed|access denied|contact admin/i.test(message);
}

export async function getMandateAccessToken(): Promise<string | null> {
  const candidates = await getMandateTokenCandidates();
  for (const c of candidates) {
    if (await tokenIsAccepted(c.token, c.source)) {
      lastTokenSource = c.source;
      return c.token;
    }
  }
  lastTokenSource = "none";
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

  const candidates = await getMandateTokenCandidates();
  if (candidates.length === 0) {
    return { created: false, mandateCode: "", nibssAccount: "", nibssMessage: "",
      raw: { step: "create", request: payload, error: "MANDATE_AUTH_FAILED" } };
  }

  const attempts: Array<Record<string, unknown>> = [];
  for (const c of candidates) {
    try {
      const res = await vfdFetch(`${VFD_MANDATE_BASE}${VFD_MANDATE_CREATE_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", AccessToken: c.token },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      attempts.push({ source: c.source, http_status: res.status, response: json });

      // Token not valid/entitled for e-mandate → try the next credential pair.
      if (isInvalidTokenResponse(res.status, json as Record<string, unknown>)) {
        console.warn(`[mandate-create] token source=${c.source} rejected (${res.status})`);
        continue;
      }

      const data = ((json as Record<string, any>)?.data || {}) as Record<string, unknown>;
      const mandateCode = String(data.mandateCode || data.mandateId || data.reference || "");
      const nibssMessage = String(data.message || (json as Record<string, any>)?.message || "");
      const nibssAccount = String(
        data.nibssAccount || data.accountNumber || data.account || data.virtualAccountNumber || "",
      ) || extractNibssAccount(nibssMessage);
      const status = String((json as Record<string, any>)?.status || "");
      // An empty / undocumented body is NEVER a created mandate.
      const created = (status === "00" || res.status === 202) && !!(mandateCode || nibssAccount);
      lastTokenSource = c.source;
      return { created, mandateCode, nibssAccount, nibssMessage,
        raw: { step: "create", request: payload, response: json, http_status: res.status,
          token_source: c.source, attempts } };
    } catch (e) {
      attempts.push({ source: c.source, error: e instanceof Error ? e.message : String(e) });
    }
  }

  lastTokenSource = "none";
  const last = attempts[attempts.length - 1] || {};
  return { created: false, mandateCode: "", nibssAccount: "", nibssMessage: "",
    raw: { step: "create", request: payload, response: (last as any).response,
      http_status: (last as any).http_status ?? 0, error: "MANDATE_AUTH_FAILED", attempts } };
}


export interface MandateStatusResult {
  approved: boolean;
  rejected: boolean;
  status: string;
  raw: Record<string, unknown>;
  http_status: number;
}

/**
 * Stage 2 — poll MANDATE-APPROVAL-STATUS using the creation reference.
 *
 * IMPORTANT: only VFD's explicit BANK approval counts. VFD returns
 * `mandateState: "ACTIVE"` with `mandateWorkflowStatus:
 * NEW_MANDATE_INITIATED_BY_BILLER` ("Biller Initiated") as soon as WE create
 * the mandate — that is our own request being acknowledged, NOT the payer's
 * bank approving the debit instruction. Treating that as approved produced
 * mandates marked bank_approved locally that VFD then rejected at
 * /account/debit with status 108. The mandate stays PENDING until VFD's
 * workflow status itself says approved/authorised by the bank.
 */
const BILLER_INITIATED_RE = /initiated.?by.?biller|biller.?initiated|new.?mandate/i;

export function isBankApprovedWorkflow(workflowStatus: string, description: string): boolean {
  const text = `${workflowStatus || ""} ${description || ""}`;
  if (BILLER_INITIATED_RE.test(text)) return false;
  if (/pending|await|initiat/i.test(text)) return false;
  return /bank.?approved|approved.?by.?bank|mandate.?approved|authoris|authoriz|^\s*approved\s*$/i.test(text) ||
    /\bapproved\b/i.test(text);
}

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
    const workflow = String(data.mandateWorkflowStatus || "");
    const desc = String(
      data.mandateWorkflowStatusDescription || data.mandateWorkflowStatus || data.mandateState || "",
    );
    // NOTE: `mandateState === "ACTIVE"` alone is NOT approval — see comment above.
    const approved = isBankApprovedWorkflow(workflow, desc);
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
  failureClass: "none" | "insufficient_funds" | "mandate_revoked" | "auth" | "bank_error" | "not_approved";
  message: string;
}

function classifyDebitFailure(message: string, httpStatus: number): MandateDebitResult["failureClass"] {
  const m = (message || "").toLowerCase();
  // VFD status 108 — the bank has NOT approved the mandate yet (still in the
  // biller-initiated stage). This is not a bank error; the mandate is simply
  // still pending and must be shown to the user as such.
  if (/has not been approved by the bank|not\s*approved.*bank|initiated_by_biller/.test(m)) return "not_approved";
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
  const payload = {
    amount: String(params.amount),
    narration: params.narration,
    mandateReference: params.mandateReference,
    transactionReference: params.transactionReference,
  };

  // Order the tokens so the one that most recently passed the probe is tried
  // first, then fail over to the remaining credential pairs. A 401/403
  // "Invalid wallet token" proves VFD rejected the call BEFORE touching the
  // payer's bank, so re-presenting with another token cannot double-debit.
  const candidates = await getMandateTokenCandidates();
  const probed = await getMandateAccessToken();
  const ordered = probed
    ? [{ source: lastTokenSource || "probed", token: probed },
       ...candidates.filter((c) => c.token !== probed)]
    : candidates;

  if (ordered.length === 0) {
    return { ok: false, raw: { request: payload, error: "MANDATE_AUTH_FAILED" }, http_status: 0,
      failureClass: "auth", message: "Mandate provider authentication failed" };
  }

  let last: MandateDebitResult | null = null;
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    try {
      const res = await vfdFetch(`${VFD_MANDATE_BASE}/account/debit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", AccessToken: c.token },
        body: JSON.stringify(payload),
        // Distinct gateway key per token attempt, otherwise the gateway replays
        // the stored 403 instead of forwarding the retry.
        idempotencyKey: i === 0 ? params.idempotencyKey : `${params.idempotencyKey}-t${i}`,
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      const status = String((json as Record<string, any>)?.status || "");
      const message = String((json as Record<string, any>)?.message || (json as Record<string, any>)?.error || "");
      const ok = status === "00";
      last = {
        ok,
        raw: { request: payload, response: json, http_status: res.status, token_source: c.source, attempt: i + 1 },
        http_status: res.status,
        failureClass: ok ? "none" : classifyDebitFailure(message, res.status),
        message: message || (ok ? "Successful" : "Debit not confirmed by VFD"),
      };
      // Only an auth rejection is safe (and worth) retrying with another token.
      if (ok || !isInvalidTokenResponse(res.status, json as Record<string, unknown>)) return last;
      console.warn(`[mandate-debit] token source=${c.source} rejected (${res.status}) — trying next`);
    } catch (e) {
      last = { ok: false, raw: { request: payload, error: e instanceof Error ? e.message : String(e) }, http_status: 0,
        failureClass: "bank_error", message: e instanceof Error ? e.message : String(e) };
      return last;
    }
  }
  return last!;
}


// ---------------------------------------------------------------------------
// SHARED HELPERS — the single implementation every product must use.
// ---------------------------------------------------------------------------

/**
 * VFD-held accounts (999999 sandbox alias / 090110 CBN code) are rejected by
 * NIBSS as e-mandate payers — the payer must be an external commercial bank.
 * Enforced identically for thrift, Target Ajo and Goal Save.
 */
export function isVfdBankCode(code: string): boolean {
  const c = (code || "").replace(/^0+/, "");
  return c === "999999" || c === "90110" || code === "090110";
}

/** ONE implementation of mandate end-date math (was duplicated 3x). */
export function computeMandateEndDate(period: string, totalCycles: number, from?: Date): Date {
  const freq = mapFrequencyToVfd(period);
  // +2 cycle safety buffer so the mandate never expires before the last debit.
  return addCycles(from || new Date(), freq, Math.max(1, Number(totalCycles) || 1) + 2);
}

export interface MandateFeeResult {
  ok: boolean;
  fee: number;
  available?: number;
}

/**
 * ONE fee path: ₦100 setup fee = ₦50 Vestara management + ₦50 NIBSS.
 * MUST only be called AFTER the mandate provider token check has succeeded.
 */
export async function chargeMandateSetupFee(
  db: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>; from: (t: string) => any },
  userId: string,
  feeRef: string,
  ctx: Record<string, unknown>,
): Promise<MandateFeeResult> {
  const { error } = await db.rpc("vestara_withdraw", {
    _user_id: userId,
    _amount: MANDATE_SETUP_FEE,
    _reference: feeRef,
    _metadata: { source: "mandate_setup_fee", ...ctx },
  });
  if (error) return { ok: false, fee: MANDATE_SETUP_FEE };
  await db.from("vestara_fee_ledger").insert([
    {
      user_id: userId, fee_type: "mandate_setup_internal", amount: MANDATE_INTERNAL_SHARE,
      reference: `${feeRef}-INT`, tx_reference: feeRef,
      metadata: { ...ctx, split: "internal", parent_fee: MANDATE_SETUP_FEE },
    },
    {
      user_id: userId, fee_type: "mandate_setup_nibss", amount: MANDATE_NIBSS_SHARE,
      reference: `${feeRef}-NIBSS`, tx_reference: feeRef,
      metadata: { ...ctx, split: "nibss", parent_fee: MANDATE_SETUP_FEE },
    },
  ]);
  return { ok: true, fee: MANDATE_SETUP_FEE };
}

export async function refundMandateSetupFee(
  db: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  userId: string,
  feeRef: string,
  ctx: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("vestara_deposit", {
      _user_id: userId,
      _amount: MANDATE_SETUP_FEE,
      _reference: `${feeRef}-REFUND`,
      _metadata: { source: "mandate_setup_fee_refund", original_reference: feeRef, ...ctx },
    });
    return !error && !!(data as { success?: boolean } | null)?.success;
  } catch {
    return false;
  }
}

/**
 * Roll every product-level mirror of a mandate back to "awaiting bank
 * approval" when VFD says the bank has not approved it. Applied to all
 * e-mandate products so no surface can display an unapproved mandate as live.
 */
export async function demoteProductMandateStatus(db: any, mandateReference: string) {
  if (!mandateReference) return;
  try {
    await db.from("vfd_sandbox_group_members")
      .update({ mandate_status: "awaiting_approval", mandate_authorized_at: null })
      .eq("mandate_reference", mandateReference);
    await db.from("vfd_sandbox_target_members")
      .update({ mandate_status: "pending" })
      .eq("mandate_reference", mandateReference);
    await db.from("vestara_savings")
      .update({ mandate_status: "pending" })
      .eq("mandate_reference", mandateReference);
  } catch {
    // best-effort mirror update; the canonical `mandates` row is authoritative
  }
}


export interface CollectDebitResult {
  /** TRUE only when VFD answered status === "00". Nothing may be booked otherwise. */
  collected: boolean;
  /** True when a concurrent/duplicate run already owns this scheduled slot. */
  skipped: boolean;
  reason: string;
  attemptId: string | null;
  transactionReference: string;
  failureClass: MandateDebitResult["failureClass"] | "none";
  raw: Record<string, unknown>;
}

/**
 * THE single mandate-collection entry point. Every product's collection worker
 * (thrift cycle sweep, Target Ajo sweep, Goal Save debit worker) calls this and
 * nothing else.
 *
 * Guarantees:
 *  1. `claim_mandate_debit_attempt` atomically claims (mandate_id, scheduled_date)
 *     BEFORE any VFD call. A duplicate/concurrent run returns skipped:true.
 *  2. The real VFD ACCOUNT DEBIT endpoint is called with the claim's
 *     idempotency key, so a network retry cannot double-charge at the bank.
 *  3. `collected` is true ONLY when VFD returns status "00". Callers must post
 *     product ledger entries exclusively on `collected === true` — never on an
 *     assumed or merely-scheduled basis.
 */
export async function collectMandateDebit(params: {
  db: any;
  mandateId: string;
  mandateReference: string;
  amount: number;
  purpose: string;
  productRef: string;
  scheduledDate: string;
  /**
   * Collection slot identity. Thrift passes a CYCLE tag (e.g. "c2") so a late
   * or failed member cannot permanently offset the group by a calendar day.
   * When omitted the slot is the calendar date (cadence-driven products).
   */
  slotKey?: string;
  /** Minutes that must elapse before a failed attempt in this slot is re-armed. */
  retryAfterMinutes?: number;
  /** Max attempts (initial + retries) allowed inside one slot. */
  maxAttempts?: number;
  idempotencyKey?: string;
}): Promise<CollectDebitResult> {
  const { db } = params;
  const scheduledDate = params.scheduledDate.slice(0, 10);
  const slotKey = (params.slotKey || "").trim();
  const txRef = `vestara-ddm-debit-${params.mandateId}-${slotKey || scheduledDate}`;

  const { data: claim, error: claimErr } = await db.rpc("claim_mandate_debit_attempt", {
    _mandate_id: params.mandateId,
    _scheduled_date: scheduledDate,
    _amount: Number(params.amount),
    _transaction_reference: txRef,
    _slot_key: slotKey || null,
    _retry_after_minutes: params.retryAfterMinutes ?? 60,
    _max_attempts: params.maxAttempts ?? 3,
  });
  const claimResult = (claim || {}) as Record<string, any>;
  if (claimErr || !claimResult.claimed) {
    return {
      collected: false, skipped: true,
      reason: String(claimResult.reason || (claimErr as any)?.message || "already_claimed"),
      attemptId: (claimResult.attempt_id as string) || null,
      transactionReference: txRef, failureClass: "none", raw: {},
    };
  }

  const attemptId = claimResult.attempt_id as string;
  // VFD rejects a reused transaction id ("Transaction Id Exists", status 199),
  // so the id sent to VFD is scoped to the CLAIM, not just the day. Same-day
  // duplicate collection is still blocked by claim_mandate_debit_attempt; a
  // legitimately re-armed retry gets a fresh, non-colliding id. The id stays
  // stable across network retries of the same claim.
  const vfdTxRef = attemptId ? `${txRef}-${String(attemptId).slice(0, 8)}` : txRef;
  await db.from("mandate_debit_attempts")
    .update({ transaction_reference: vfdTxRef })
    .eq("id", attemptId);
  const debit = await debitMandate({
    mandateReference: params.mandateReference,
    amount: Number(params.amount),
    narration: params.purpose,
    transactionReference: vfdTxRef,
    idempotencyKey: params.idempotencyKey || (claimResult.idempotency_key as string) || vfdTxRef,
  });


  if (!debit.ok) {
    await db.from("mandate_debit_attempts").update({
      status: "failed",
      failure_class: debit.failureClass,
      failure_reason: debit.message,
      vfd_response: debit.raw,
      needs_review: debit.failureClass !== "insufficient_funds" && debit.failureClass !== "not_approved",
      completed_at: new Date().toISOString(),
    }).eq("id", attemptId);

    // VFD is the source of truth on approval. If it tells us the bank has not
    // approved this mandate, roll our local record back to pending so the user
    // sees "awaiting bank approval" instead of a false "active" state, and so
    // the status poller picks it up again.
    if (debit.failureClass === "not_approved") {
      await db.from("mandates").update({
        status: "pending", bank_approved_at: null, resolved_at: null,
      }).eq("id", params.mandateId).neq("status", "pending");
      await demoteProductMandateStatus(db, params.mandateReference);
    }

    return {
      collected: false, skipped: false, reason: debit.message, attemptId,
      transactionReference: vfdTxRef, failureClass: debit.failureClass, raw: debit.raw,
    };
  }


  await db.from("mandate_debit_attempts").update({
    status: "succeeded",
    vfd_response: debit.raw,
    ledger_reference: vfdTxRef,
    completed_at: new Date().toISOString(),
  }).eq("id", attemptId);

  return {
    collected: true, skipped: false, reason: "VFD confirmed (status 00)", attemptId,
    transactionReference: vfdTxRef, failureClass: "none", raw: debit.raw,
  };

}

/** Mark the shared `mandates` registry row as ledger-posted for an attempt. */
export async function markAttemptLedgerPosted(db: any, attemptId: string | null, reference: string | null, posted: boolean) {
  if (!attemptId) return;
  await db.from("mandate_debit_attempts").update({
    ledger_posted: posted,
    ledger_reference: posted ? reference : null,
    needs_review: !posted,
  }).eq("id", attemptId);
}

/**
 * Register (or fetch) the canonical `mandates` row for a product mandate.
 * Every product writes here so that collection idempotency, polling and the
 * admin audit trail all read from ONE table.
 */
export async function registerMandate(db: any, row: {
  user_id: string;
  product_type: "thrift" | "target_ajo" | "fd_investment";
  product_reference: string;
  mandate_reference: string;
  mandate_code?: string | null;
  amount: number;
  frequency: string;
  start_date: string;
  end_date: string;
  payer: MandatePayer;
  nibss_account?: string | null;
  nibss_message?: string | null;
  setup_fee_reference?: string | null;
  vfd_payload?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const { data, error } = await db.from("mandates").insert({
      user_id: row.user_id,
      product_type: row.product_type,
      product_reference: row.product_reference,
      mandate_reference: row.mandate_reference,
      mandate_code: row.mandate_code || null,
      status: "pending",
      amount: row.amount,
      frequency: row.frequency,
      start_date: row.start_date,
      end_date: row.end_date,
      payer_bank_code: row.payer.bankCode,
      payer_account_number: row.payer.accountNumber,
      payer_phone: row.payer.phone,
      payer_email: row.payer.email,
      payer_address: row.payer.address,
      nibss_account: row.nibss_account || null,
      nibss_message: row.nibss_message || null,
      setup_fee: MANDATE_SETUP_FEE,
      setup_fee_internal_share: MANDATE_INTERNAL_SHARE,
      setup_fee_nibss_share: MANDATE_NIBSS_SHARE,
      setup_fee_reference: row.setup_fee_reference || null,
      setup_fee_charged_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + MANDATE_EXPIRY_DAYS * 86400_000).toISOString(),
      vfd_payload: row.vfd_payload || {},
    }).select("id").single();
    if (error) {
      console.error("[mandate] registry insert failed", error);
      return null;
    }
    return data.id as string;
  } catch (e) {
    console.error("[mandate] registry insert threw", e);
    return null;
  }
}
