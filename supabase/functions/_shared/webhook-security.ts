// Shared hardening for public VFD webhook receivers.
//
// Layers:
//   1. Shared secret (constant-time compare) — header `x-webhook-secret`
//      (query `?secret=` still tolerated for VFD configs without custom headers).
//   2. Optional HMAC-SHA256 signature over the RAW body, verified against
//      VFD_WEBHOOK_SIGNING_KEY when that secret is configured. Accepts the
//      common header names; enable it once VFD confirms their algorithm.
//   3. Replay protection: if the request carries a timestamp (header or body),
//      reject anything outside a ±5 minute window.
//   4. Audit: every rejected request is logged to vfd_sandbox_webhook_logs
//      with event_type = 'webhook_auth_failure' (IP, path, reason, headers),
//      so probing is visible in the admin webhook log view.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const MAX_SKEW_MS = 5 * 60 * 1000;

const SIGNING_KEY = Deno.env.get("VFD_WEBHOOK_SIGNING_KEY") || "";

const SIGNATURE_HEADERS = [
  "x-vfd-signature",
  "x-webhook-signature",
  "x-signature",
  "signature",
];

const TIMESTAMP_HEADERS = [
  "x-vfd-timestamp",
  "x-webhook-timestamp",
  "x-timestamp",
];

/** Constant-time string comparison (avoids secret-length/prefix timing leaks). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Compare lengths in a way that still runs the full loop.
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseTimestamp(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    // seconds vs milliseconds
    return n < 1e12 ? n * 1000 : n;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export type VerifyResult =
  | { ok: true; body: string; payload: Record<string, unknown> }
  | { ok: false; status: number; reason: string };

/**
 * Verify a public webhook request. Reads the raw body ONCE (needed for HMAC),
 * so callers must use the returned `payload` instead of `req.json()`.
 */
export async function verifyWebhookRequest(
  req: Request,
  opts: { secret: string; db: SupabaseClient; source: string },
): Promise<VerifyResult> {
  const { secret, db, source } = opts;
  const url = new URL(req.url);

  const body = await req.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = {};
  }

  const fail = async (status: number, reason: string): Promise<VerifyResult> => {
    await logAuthFailure(db, req, source, reason);
    return { ok: false, status, reason };
  };

  // ── Layer 1: shared secret, constant-time ──────────────────────
  const provided =
    req.headers.get("x-webhook-secret") ||
    req.headers.get("X-Webhook-Secret") ||
    url.searchParams.get("secret") ||
    "";
  if (!secret) return await fail(401, "server_secret_not_configured");
  if (!provided) return await fail(401, "missing_secret");
  if (!timingSafeEqual(provided, secret)) return await fail(401, "invalid_secret");

  // ── Layer 2: HMAC signature (active only when a signing key is set) ──
  if (SIGNING_KEY) {
    let headerName = "";
    let signature = "";
    for (const h of SIGNATURE_HEADERS) {
      const v = req.headers.get(h);
      if (v) {
        headerName = h;
        signature = v.trim();
        break;
      }
    }
    if (!signature) return await fail(401, "missing_signature");
    // Tolerate "sha256=<hex>" prefixes.
    const clean = signature.replace(/^sha256=/i, "").toLowerCase();
    const expected = await hmacSha256Hex(SIGNING_KEY, body);
    if (!timingSafeEqual(clean, expected)) {
      return await fail(401, `invalid_signature (${headerName})`);
    }
  }

  // ── Layer 3: replay window (only when a timestamp is present) ──
  let tsRaw = "";
  for (const h of TIMESTAMP_HEADERS) {
    const v = req.headers.get(h);
    if (v) { tsRaw = v; break; }
  }
  if (!tsRaw) {
    const root = (payload.data && typeof payload.data === "object")
      ? payload.data as Record<string, unknown>
      : payload;
    const candidate = root["timestamp"] ?? root["transactionDate"] ?? root["eventTime"];
    if (candidate != null) tsRaw = String(candidate);
  }
  if (tsRaw) {
    const ts = parseTimestamp(tsRaw);
    if (ts !== null) {
      const skew = Math.abs(Date.now() - ts);
      if (skew > MAX_SKEW_MS) {
        return await fail(401, `stale_timestamp (skew ${Math.round(skew / 1000)}s)`);
      }
    }
  }

  return { ok: true, body, payload };
}

export async function logAuthFailure(
  db: SupabaseClient,
  req: Request,
  source: string,
  reason: string,
): Promise<void> {
  const url = new URL(req.url);
  const meta = {
    source,
    reason,
    method: req.method,
    path: url.pathname,
    ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
    user_agent: req.headers.get("user-agent") || null,
    had_secret_header: Boolean(req.headers.get("x-webhook-secret")),
    had_query_secret: url.searchParams.has("secret"),
    at: new Date().toISOString(),
  };
  // Surfaced in edge function logs for alerting/monitoring.
  console.error("[webhook-auth-failure]", JSON.stringify(meta));
  try {
    await db.from("vfd_sandbox_webhook_logs").insert({
      event_type: "webhook_auth_failure",
      payload: meta,
      processed: true,
    });
  } catch (_) {
    // never let audit logging break the response path
  }
}
