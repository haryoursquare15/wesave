// vfd-banking edge function — quote_transfer action enabled
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// VFD Environment Configuration
const VFD_MODE = "sandbox";
const VFD_BASE_URL =
  VFD_MODE === "sandbox"
    ? "https://api-devapps.vfdbank.systems/vtech-wallet/api/v2/wallet2"
    : "https://api-apps.vfdbank.systems/vtech-wallet/api/v2/wallet2";

const VFD_AUTH_URL =
  VFD_MODE === "sandbox"
    ? "https://api-devapps.vfdbank.systems/vfd-tech/baas-portal/v1.1/baasauth/token"
    : "https://api-apps.vfdbank.systems/vfd-tech/baas-portal/v1.1/baasauth/token";

// In-memory token cache (per isolate)
let cachedToken: string | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const staticToken = Deno.env.get("VFD_ACCESS_TOKEN");
  const consumerKey = Deno.env.get("VFD_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("VFD_CONSUMER_SECRET");

  if (consumerKey && consumerSecret) {
    console.log("[VFD] Generating access token via auth API...");
    try {
      const res = await fetch(VFD_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "-1" }),
      });

      const data = await res.json();
      if (data?.status === "00" && data?.data?.access_token) {
        cachedToken = data.data.access_token;
        console.log("[VFD] Access token generated successfully");
        return cachedToken;
      }

      console.error("[VFD] Token generation failed:", JSON.stringify(data));
    } catch (err) {
      console.error("[VFD] Token generation error:", err);
    }
  }

  if (staticToken) {
    cachedToken = staticToken;
    return staticToken;
  }

  throw new Error("VFD credentials not configured. Set VFD_CONSUMER_KEY + VFD_CONSUMER_SECRET or VFD_ACCESS_TOKEN.");
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing authorization header");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const publishableKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!publishableKey) {
    throw new Error("SUPABASE_ANON_KEY not configured");
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publishableKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;

  if (error || !userId) throw new Error("Invalid or expired token");
  return { id: userId };
}

/**
 * SECURITY: Confirms that the supplied VFD account number actually belongs
 * to the authenticated user. Used to prevent users from initiating transfers
 * or credits on accounts they do not own.
 */
async function assertOwnsAccount(userId: string, accountNo: string): Promise<void> {
  if (!accountNo) throw new Error("accountNo required");
  // Hard block: the platform pool can never be acted on as a personal account.
  if (accountNo === PLATFORM_POOL_NUBAN) {
    throw new Error("Platform settlement account cannot be used as a personal account");
  }
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("vfd_sandbox_clients")
    .select("vfd_account_number")
    .eq("user_id", userId)
    .eq("vfd_account_number", accountNo)
    .maybeSingle();
  if (error) throw new Error("Account ownership check failed");
  if (!data) throw new Error("Account does not belong to authenticated user");
}


// Sandbox credit caps (per user) to prevent abuse of test-credit endpoint
const SANDBOX_CREDIT_MAX_PER_TXN = 500_000; // ₦500k single
const SANDBOX_CREDIT_MAX_PER_DAY = 1_000_000; // ₦1M daily

// Platform settlement (pool) account at VFD. This NUBAN is owned by Vestara,
// NOT by any end user. It is the corporate settlement account through which
// all inbound credits and outbound debits flow; Vestara's internal ledger
// (vestara_accounts / vestara_ledger_entries) maps every movement back to
// the originating user. It MUST never be persisted as a user's per-user
// VFD account number.
const PLATFORM_POOL_NUBAN = "1001695610";


// VFD API helper
async function vfdRequest(
  endpoint: string,
  method: string = "GET",
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>
): Promise<{ data: unknown; status: number }> {
  const accessToken = await getAccessToken();
  const url = new URL(`${VFD_BASE_URL}${endpoint}`);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "AccessToken": accessToken,
    },
  };

  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  console.log(`[VFD ${VFD_MODE}] ${method} ${url.pathname}${url.search}`);

  const response = await fetch(url.toString(), options);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    console.error(`[VFD] Non-JSON response (${response.status}): ${text.slice(0, 300)}`);
    return {
      data: { error: `VFD API returned non-JSON (HTTP ${response.status}). Token may be invalid or expired.` },
      status: response.status,
    };
  }

  const data = await response.json();

  // If token expired, clear cache and retry once
  if (response.status === 403 && (data as Record<string, unknown>)?.message?.toString()?.toLowerCase()?.includes("expired")) {
    console.log("[VFD] Token expired, regenerating...");
    cachedToken = null;
    const newToken = await getAccessToken();
    (options.headers as Record<string, string>)["AccessToken"] = newToken;

    const retryResponse = await fetch(url.toString(), options);
    const retryContentType = retryResponse.headers.get("content-type") || "";
    if (!retryContentType.includes("application/json")) {
      const text = await retryResponse.text();
      return { data: { error: `VFD retry non-JSON (${retryResponse.status}): ${text.slice(0, 200)}` }, status: retryResponse.status };
    }
    const retryData = await retryResponse.json();
    return { data: retryData, status: retryResponse.status };
  }

  return { data, status: response.status };
}

// Generate SHA512 signature for transfers
async function generateTransferSignature(fromAccount: string, toAccount: string): Promise<string> {
  const input = `${fromAccount}${toAccount}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── PHASE 1: IDEMPOTENCY + DLQ HELPERS ───
// Reserve an idempotency key BEFORE the outbound VFD money-moving call.
// Returns { mode: "new" | "replay", row } — on replay the caller should return
// the cached response rather than hit VFD again.
async function reserveIdempotencyKey(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  params: { key: string; userId: string | null; action: string; reference: string | null; requestHash?: string | null }
): Promise<
  | { mode: "new"; row: Record<string, unknown> }
  | { mode: "replay"; row: Record<string, unknown> }
> {
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("vfd_idempotency_keys")
    .insert({
      idempotency_key: params.key,
      user_id: params.userId,
      action: params.action,
      transaction_reference: params.reference,
      request_hash: params.requestHash ?? null,
      status: "pending",
    })
    .select()
    .maybeSingle();

  if (!insErr && inserted) return { mode: "new", row: inserted as Record<string, unknown> };

  // Conflict — fetch the existing row and decide replay vs retry.
  const { data: existing } = await supabaseAdmin
    .from("vfd_idempotency_keys")
    .select("*")
    .eq("idempotency_key", params.key)
    .maybeSingle();

  if (!existing) {
    // Unexpected; treat as new to avoid hard-blocking the user.
    return { mode: "new", row: { idempotency_key: params.key } };
  }

  // Terminal results are replayed verbatim — do NOT call VFD again.
  if (existing.status === "completed" || existing.status === "failed") {
    return { mode: "replay", row: existing as Record<string, unknown> };
  }

  // pending → bump attempts and let the caller proceed (covers prior timeout).
  await supabaseAdmin
    .from("vfd_idempotency_keys")
    .update({
      attempts: (Number(existing.attempts) || 1) + 1,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("idempotency_key", params.key);

  return { mode: "new", row: existing as Record<string, unknown> };
}

async function settleIdempotencyKey(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  key: string,
  result: { status: "completed" | "failed" | "pending"; response: unknown; http_status?: number | null }
) {
  await supabaseAdmin
    .from("vfd_idempotency_keys")
    .update({
      status: result.status,
      response: result.response as Record<string, unknown> | null,
      http_status: result.http_status ?? null,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("idempotency_key", key);
}

async function pushWebhookToDlq(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  params: { event_type?: string | null; reference?: string | null; payload: unknown; headers?: Record<string, string> | null; error: string }
) {
  try {
    await supabaseAdmin.from("vfd_webhook_dlq").insert({
      event_type: params.event_type ?? null,
      reference: params.reference ?? null,
      payload: params.payload as Record<string, unknown>,
      headers: params.headers as Record<string, unknown> | null,
      error: params.error,
    });
  } catch (e) {
    console.error("[VFD DLQ] failed to enqueue:", e);
  }
}

// ─── PHASE 3: append-only tx event log ───
async function recordTxEvent(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  params: {
    transaction_id?: string | null;
    user_id?: string | null;
    reference?: string | null;
    event_type: string;
    actor?: string;
    from_status?: string | null;
    to_status?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  try {
    await supabaseAdmin.from("vfd_transaction_events").insert({
      transaction_id: params.transaction_id ?? null,
      user_id: params.user_id ?? null,
      reference: params.reference ?? null,
      event_type: params.event_type,
      actor: params.actor ?? "system",
      from_status: params.from_status ?? null,
      to_status: params.to_status ?? null,
      payload: params.payload ?? {},
    });
  } catch (e) {
    console.error("[VFD TxEvent] failed to record:", e);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function extractVfdBalance(payload: unknown): number {
  const root = payload as Record<string, unknown> | null;
  const inner = (root?.data as Record<string, unknown> | undefined) ?? {};
  const candidates = [
    inner.availableBalance,
    inner.available_balance,
    inner.ledgerBalance,
    inner.ledger_balance,
    inner.accountBalance,
    inner.account_balance,
    root?.availableBalance,
    root?.ledgerBalance,
    root?.accountBalance,
  ];

  for (const candidate of candidates) {
    const amount = toNumber(candidate);
    if (amount > 0) return amount;
  }

  return toNumber(candidates[0]);
}

async function getRecordedSandboxBalance(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) {
  // Count credits only when completed.
  // Count debits/transfers when reserved OR completed (reservation must
  // immediately reduce available balance to prevent double-spend during the
  // window between VFD call and webhook confirmation).
  const { data } = await supabaseAdmin
    .from("vfd_sandbox_transactions")
    .select("amount, transaction_type, status")
    .eq("user_id", userId)
    .in("status", ["completed", "reserved"]);

  return (data ?? []).reduce((total, tx) => {
    const amount = toNumber(tx.amount);
    const status = tx.status as string;
    switch (tx.transaction_type) {
      case "credit":
        return status === "completed" ? total + amount : total;
      case "transfer":
      case "debit":
        // reserved or completed both count as money-out
        return total - amount;
      default:
        return total;
    }
  }, 0);
}

async function ensureBalanceRow(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  options: { accountNo?: string | null; preserveExisting?: boolean } = {}
) {
  const { preserveExisting = true } = options;

  const { data: existing } = await supabaseAdmin
    .from("vfd_user_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  let accountNo = options.accountNo ?? null;
  if (!accountNo) {
    const { data: client } = await supabaseAdmin
      .from("vfd_sandbox_clients")
      .select("vfd_account_number")
      .eq("user_id", userId)
      .maybeSingle();
    accountNo = client?.vfd_account_number ?? null;
  }

  let liveBalance = 0;
  if (accountNo) {
    const { data: balData } = await vfdRequest("/account/enquiry", "GET", undefined, {
      accountNumber: accountNo,
    });
    liveBalance = extractVfdBalance(balData);
  }

  const recordedBalance = await getRecordedSandboxBalance(supabaseAdmin, userId);
  const lockedBalance = toNumber(existing?.locked_balance);
  const savingsBalance = toNumber(existing?.savings_balance);
  const existingTotal = toNumber(existing?.total_balance);
  const totalBalance = Math.max(
    liveBalance,
    recordedBalance,
    lockedBalance + savingsBalance,
    preserveExisting ? existingTotal : 0
  );
  const availableBalance = Math.max(totalBalance - lockedBalance - savingsBalance, 0);
  const timestamp = new Date().toISOString();

  if (existing) {
    await supabaseAdmin
      .from("vfd_user_balances")
      .update({
        total_balance: totalBalance,
        locked_balance: lockedBalance,
        savings_balance: savingsBalance,
        last_synced_at: timestamp,
        updated_at: timestamp,
      })
      .eq("user_id", userId);
  } else {
    await supabaseAdmin.from("vfd_user_balances").insert({
      user_id: userId,
      total_balance: totalBalance,
      locked_balance: lockedBalance,
      savings_balance: savingsBalance,
      last_synced_at: timestamp,
    });
  }

  const { data: updated } = await supabaseAdmin
    .from("vfd_user_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return { balance: updated, liveBalance, recordedBalance };
}

async function getVestaraSettlementSnapshot(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) {
  const [{ data: walletAccount }, { data: settlementAccount }] = await Promise.all([
    supabaseAdmin
      .from("vestara_accounts")
      .select("id, balance")
      .eq("user_id", userId)
      .eq("account_type", "wallet")
      .maybeSingle(),
    supabaseAdmin
      .from("vestara_accounts")
      .select("id, balance")
      .eq("is_system", true)
      .eq("account_type", "settlement")
      .maybeSingle(),
  ]);

  return {
    walletAccountId: walletAccount?.id ?? null,
    settlementAccountId: settlementAccount?.id ?? null,
    walletBalance: toNumber(walletAccount?.balance),
    settlementBalance: toNumber(settlementAccount?.balance),
  };
}

async function syncBalanceCachesFromVestara(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) {
  const { data: accounts, error } = await supabaseAdmin
    .from("vestara_accounts")
    .select("account_type, balance")
    .eq("user_id", userId);

  if (error) {
    console.error("[balance-sync] Could not read Vestara accounts:", error);
    return null;
  }

  const wallet = (accounts ?? [])
    .filter((a) => a.account_type === "wallet")
    .reduce((sum, a) => sum + toNumber(a.balance), 0);
  const locked = (accounts ?? [])
    .filter((a) => a.account_type === "locked_savings")
    .reduce((sum, a) => sum + toNumber(a.balance), 0);
  const savings = (accounts ?? [])
    .filter((a) => a.account_type === "accrued_interest")
    .reduce((sum, a) => sum + toNumber(a.balance), 0);
  const timestamp = new Date().toISOString();

  const { error: walletErr } = await supabaseAdmin
    .from("wallets")
    .upsert(
      {
        user_id: userId,
        available_balance: wallet,
        locked_balance: locked,
        updated_at: timestamp,
      },
      { onConflict: "user_id" }
    );

  if (walletErr) console.error("[balance-sync] Could not sync wallets cache:", walletErr);

  const { error: vfdBalanceErr } = await supabaseAdmin
    .from("vfd_user_balances")
    .upsert(
      {
        user_id: userId,
        total_balance: wallet + locked + savings,
        available_balance: wallet,
        locked_balance: locked,
        savings_balance: savings,
        last_synced_at: timestamp,
        updated_at: timestamp,
      },
      { onConflict: "user_id" }
    );

  if (vfdBalanceErr) console.error("[balance-sync] Could not sync VFD balance cache:", vfdBalanceErr);

  return { wallet, locked, savings, total: wallet + locked + savings };
}

async function logSettlementBalanceAudit(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  payload: Record<string, unknown>
) {
  const { error } = await supabaseAdmin
    .from("vestara_settlement_balance_audit")
    .insert(payload);
  if (error) console.error("[settlement-audit] insert failed:", error);
}

// ─── ACTION HANDLERS ────────────────────────────────────────────

// BVN Lookup
// SECURITY: BVN -> PII. Restrict to:
//   1. Admins (compliance/super/finance), OR
//   2. Users who haven't completed onboarding (no vfd_sandbox_clients row yet)
// Also rate-limited to 10 lookups per user per hour to prevent BVN enumeration.
async function handleBvnLookup(userId: string, bvn: string) {
  if (!/^\d{11}$/.test(bvn)) {
    return jsonResponse({ error: "BVN must be exactly 11 digits" }, 400);
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Check admin role
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roleRows ?? []).some((r) =>
    ["super_admin", "admin", "compliance_admin", "finance_admin"].includes(r.role as string)
  );

  if (!isAdmin) {
    // Onboarding-only path: caller must NOT yet have a VFD client record
    const { data: existing } = await supabaseAdmin
      .from("vfd_sandbox_clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      return jsonResponse(
        { error: "BVN lookup is only available during onboarding" },
        403
      );
    }
  }

  // Rate-limit: max 10 lookups / user / hour. Admins are exempt from the
  // throttle (they may legitimately need bulk lookups for compliance work),
  // but every attempt — admin or not — is still audited below.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("vfd_sandbox_webhook_logs")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "bvn_lookup_audit")
    .gte("created_at", since)
    .filter("payload->>user_id", "eq", userId);

  if (!isAdmin && (count ?? 0) >= 10) {
    // Audit the throttled attempt so burst probes are still visible
    await supabaseAdmin.from("vfd_sandbox_webhook_logs").insert({
      event_type: "bvn_lookup_audit",
      payload: {
        user_id: userId,
        bvn_last4: bvn.slice(-4),
        at: new Date().toISOString(),
        outcome: "rate_limited",
      },
      processed: true,
    });
    return jsonResponse(
      { error: "Too many BVN lookups. Try again later." },
      429,
    );
  }

  // Audit the lookup attempt BEFORE calling upstream so that even crashes
  // during the VFD round-trip count toward the per-hour quota.
  await supabaseAdmin.from("vfd_sandbox_webhook_logs").insert({
    event_type: "bvn_lookup_audit",
    payload: {
      user_id: userId,
      bvn_last4: bvn.slice(-4),
      at: new Date().toISOString(),
      outcome: "attempt",
      is_admin: isAdmin,
    },
    processed: true,
  });

  const { data, status } = await vfdRequest("/client", "GET", undefined, { bvn });
  return jsonResponse({ data, vfd_status: status });
}

// Create Tiered Account - /client/tiers/individual
// Tier 1: BVN+DOB or NIN+DOB (₦30k daily limit)
// Tier 2: BVN+NIN+DOB (₦100k daily limit)
// Tier 3: BVN+NIN+Address+DOB (₦1M per txn, ₦10M daily)
async function handleCreateTiered(userId: string, body: Record<string, unknown>) {
  const bvn = body.bvn as string | undefined;
  const nin = body.nin as string | undefined;
  const dateOfBirth = body.dateOfBirth as string;
  const address = body.address as string | undefined;

  if (!dateOfBirth) {
    return jsonResponse({ error: "Date of birth is required" }, 400);
  }
  if (!bvn && !nin) {
    return jsonResponse({ error: "At least BVN or NIN is required" }, 400);
  }

  const queryParams: Record<string, string> = { dateOfBirth };
  if (bvn) queryParams.bvn = bvn;
  if (nin) queryParams.nin = nin;
  if (address) queryParams.address = address;

  let expectedTier = "1";
  if (bvn && nin && address) expectedTier = "3";
  else if (bvn && nin) expectedTier = "2";

  console.log(`[VFD create_tiered] Creating tier ${expectedTier} account`, queryParams);

  const { data, status } = await vfdRequest("/client/tiers/individual", "POST", undefined, queryParams);

  const supabaseAdmin = getSupabaseAdmin();
  const vfdData = data as Record<string, unknown>;
  const isSuccess = vfdData?.status === "00";
  const isExisting = vfdData?.status === "01";

  if (isSuccess || isExisting) {
    const innerData = (vfdData?.data || {}) as Record<string, unknown>;
    const actualTier = innerData?.currentTier?.toString() || expectedTier;
    let returnedNuban = innerData?.accountNo?.toString() || null;

    // VFD sandbox always echoes the corporate pool NUBAN (1001695610) for the
    // shared test BVNs. That account belongs to Vestara, not the user. Instead
    // of rejecting, synthesize a deterministic per-user *virtual* NUBAN for
    // display. The real settlement happens on the pool account behind the
    // scenes; the Vestara ledger tracks each user's share.
    const isPoolEcho = returnedNuban === PLATFORM_POOL_NUBAN;
    let virtualIssued = false;
    if (isPoolEcho || !returnedNuban) {
      // Deterministic 10-digit virtual NUBAN derived from user_id.
      // Prefix "9" keeps it visually distinct from real VFD NUBANs.
      const hash = Array.from(userId.replace(/-/g, ""))
        .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7);
      returnedNuban = "9" + String(hash).padStart(9, "0").slice(-9);
      virtualIssued = true;
    }

    await supabaseAdmin.from("vfd_sandbox_clients").upsert({
      user_id: userId,
      bvn: bvn || null,
      nin: nin || null,
      address: address || null,
      date_of_birth: dateOfBirth,
      vfd_client_id: innerData?.clientId?.toString() || null,
      vfd_account_number: returnedNuban,
      full_name: innerData?.firstname ? `${innerData?.firstname || ""} ${innerData?.middlename ? innerData.middlename + " " : ""}${innerData?.lastname || ""}`.trim() : null,
      phone: innerData?.phone?.toString() || null,
      gender: innerData?.gender?.toString() || null,
      tier: `tier${actualTier}`,
      kyc_method: "tiered",
      consent_status: "not_required",
      account_status: "active",
      metadata: { ...vfdData, virtual_nuban: virtualIssued || undefined, settlement_nuban: virtualIssued ? PLATFORM_POOL_NUBAN : undefined },
      source: "vfd_sandbox",
    }, { onConflict: "user_id" });
  }

  return jsonResponse({ data, vfd_status: status });
}


// Legacy backward compat → Tier 1
async function handleCreateNoConsent(userId: string, bvn: string, dateOfBirth: string) {
  return handleCreateTiered(userId, { bvn, dateOfBirth });
}

// Create Account - Consent Flow (iGree)
async function handleCreateConsent(userId: string, body: Record<string, unknown>) {
  const { data: clientData, status: clientStatus } = await vfdRequest("/client/individual", "POST", body);

  if (clientStatus !== 200) {
    return jsonResponse({ data: clientData, vfd_status: clientStatus });
  }

  const vfdData = clientData as Record<string, unknown>;
  const supabaseAdmin = getSupabaseAdmin();

  await supabaseAdmin.from("vfd_sandbox_clients").upsert({
    user_id: userId,
    bvn: body.bvn as string,
    date_of_birth: body.dob as string || body.dateOfBirth as string,
    full_name: `${body.firstname} ${body.lastname}`,
    phone: body.phone as string,
    gender: body.gender as string,
    vfd_client_id: vfdData?.data
      ? (vfdData.data as Record<string, unknown>)?.clientId?.toString()
      : null,
    vfd_account_number: vfdData?.data
      ? (vfdData.data as Record<string, unknown>)?.accountNo?.toString()
      : null,
    kyc_method: "consent",
    consent_status: "pending",
    account_status: "pending_consent",
    metadata: vfdData,
    source: "vfd_sandbox",
  }, { onConflict: "user_id" });

  return jsonResponse({ data: clientData, vfd_status: clientStatus });
}

// Trigger BVN Consent
async function handleBvnConsent(bvn: string, reference?: string) {
  const params: Record<string, string> = { bvn, type: "02" };
  if (reference) params.reference = reference;

  const { data, status } = await vfdRequest("/bvn-consent", "GET", undefined, params);
  return jsonResponse({ data, vfd_status: status });
}

// Release Client
async function handleClientRelease(userId: string, accountNo: string) {
  const { data, status } = await vfdRequest("/client/release", "POST", { accountNo });

  const supabaseAdmin = getSupabaseAdmin();
  const vfdData = data as Record<string, unknown>;

  if (status === 200 && vfdData?.status === "00") {
    await supabaseAdmin
      .from("vfd_sandbox_clients")
      .update({
        consent_status: "confirmed",
        account_status: "active",
        metadata: vfdData,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return jsonResponse({ data, vfd_status: status });
}

// Tier Upgrade - /client/update
async function handleTierUpgrade(userId: string, body: Record<string, unknown>) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: clientData } = await supabaseAdmin
    .from("vfd_sandbox_clients")
    .select("vfd_account_number, bvn, nin, address")
    .eq("user_id", userId)
    .maybeSingle();

  const accountNo = (body.accountNo as string) || clientData?.vfd_account_number;
  if (!accountNo) {
    return jsonResponse({ error: "Account number is required for tier upgrade" }, 400);
  }

  const upgradePayload: Record<string, unknown> = { accountNo };
  if (body.bvn) upgradePayload.bvn = body.bvn;
  if (body.nin) upgradePayload.nin = body.nin;
  if (body.address) upgradePayload.address = body.address;

  console.log("[VFD tier_upgrade] Payload:", JSON.stringify(upgradePayload));

  const { data, status } = await vfdRequest("/client/update", "POST", upgradePayload);
  console.log("[VFD tier_upgrade] Response:", JSON.stringify(data));

  const vfdData = data as Record<string, unknown>;
  if (status === 200 && vfdData?.status === "00") {
    const innerData = (vfdData?.data || {}) as Record<string, unknown>;
    const newTier = innerData?.currentTier?.toString() || "2";

    const updatePayload: Record<string, unknown> = {
      tier: `tier${newTier}`,
      updated_at: new Date().toISOString(),
    };
    if (body.nin) updatePayload.nin = body.nin;
    if (body.bvn) updatePayload.bvn = body.bvn;
    if (body.address) updatePayload.address = body.address;

    await supabaseAdmin
      .from("vfd_sandbox_clients")
      .update(updatePayload)
      .eq("user_id", userId);
  }

  return jsonResponse({ data, vfd_status: status });
}

// Balance Enquiry - VFD uses accountNumber (not accountNo)
async function handleBalanceEnquiry(userId: string, accountNo: string) {
  // SECURITY: only allow balance lookup on accounts owned by the caller
  try {
    await assertOwnsAccount(userId, accountNo);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "unauthorized" },
      403
    );
  }
  const { data, status } = await vfdRequest("/account/enquiry", "GET", undefined, {
    accountNumber: accountNo,
  });
  return jsonResponse({ data, vfd_status: status });
}

// Transaction History - VFD requires transactionType, startDate, endDate
async function handleTransactionHistory(
  userId: string,
  accountNo: string,
  transactionType: string = "wallet",
  startDate?: string,
  endDate?: string,
  page: string = "0",
  size: string = "20"
) {
  // SECURITY: only allow history lookup on accounts owned by the caller
  try {
    await assertOwnsAccount(userId, accountNo);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "unauthorized" },
      403
    );
  }

  // Default to last 90 days if not provided
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10) + " 23:59:59";
  const defaultStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + " 00:00:00";

  const params: Record<string, string> = {
    accountNo,
    transactionType,
    startDate: startDate || defaultStart,
    endDate: endDate || defaultEnd,
    page,
    size,
  };

  const { data, status } = await vfdRequest("/account/transactions", "GET", undefined, params);
  return jsonResponse({ data, vfd_status: status });
}

// Get Bank List
async function handleBankList() {
  const { data, status } = await vfdRequest("/bank", "GET");
  console.log("[VFD bank_list] Raw response:", JSON.stringify(data));

  // Normalize bank list: VFD returns { data: { bank: [...] } }
  const vfdData = data as Record<string, unknown>;
  let banks: Array<{ code: string; name: string }> = [];

  const innerData = vfdData?.data as Record<string, unknown> | undefined;
  const rawList = innerData?.bank || innerData?.banks || (Array.isArray(innerData) ? innerData : null);
  if (Array.isArray(rawList)) {
    banks = rawList.map((b: Record<string, unknown>) => ({
      code: (b.code || b.bankCode || b.bank_code || "").toString(),
      name: (b.name || b.bankName || b.bank_name || "").toString(),
    }));
  }

  return jsonResponse({ data, banks, vfd_status: status });
}

// Validate Beneficiary - VFD uses GET with query params
async function handleValidateBeneficiary(accountNo: string, bankCode: string, transferType: string = "inter") {
  // Always defer to VFD /transfer/recipient for name enquiry — even for intra-Vestara
  // NUBANs — so the resolved account name matches VFD's records exactly. We no
  // longer short-circuit virtual NUBANs to our local clients table.


  const { data, status } = await vfdRequest("/transfer/recipient", "GET", undefined, {
    accountNo,
    bank: bankCode,
    transfer_type: transferType,
  });
  console.log("[VFD validate_beneficiary] Status:", status, "Response:", JSON.stringify(data));

  // Normalize: extract account name from various possible response shapes
  const vfdData = data as Record<string, unknown> | null;
  const innerData = vfdData?.data as Record<string, unknown> | undefined;
  const accountName = innerData?.accountName || innerData?.account_name || innerData?.beneficiaryName || innerData?.name || null;
  const vfdStatusCode = vfdData?.status as string | undefined;
  const vfdMessage = (vfdData?.message as string | undefined) || (innerData?.message as string | undefined);

  // Surface a clear error so the UI can show a meaningful toast instead of silent failure
  if (!accountName) {
    // Always return 200 so the client can surface the error message cleanly
    // instead of supabase.functions.invoke throwing on a non-2xx status.
    return jsonResponse({
      data,
      accountName: null,
      vfd_status: status,
      error: vfdMessage || `Could not verify account (VFD status ${vfdStatusCode || status})`,
    }, 200);
  }

  return jsonResponse({ data, accountName, vfd_status: status });
}

// =============================================
// INTERBANK TRANSFER FEE + STAMP DUTY ENGINE
// Tiers (by sender wallet balance at time of transfer):
//   T1  <₦10k                 → ₦20/trf,  no free, ₦50 stamp duty
//   T2  ₦10k – ₦49,999        → 5 free/month, then ₦20, ₦50 stamp duty
//   T3  ₦50k – ₦199,999       → 15 free/month, then ₦20, ₦50 stamp duty
//   T4  ≥₦200k                → Unlimited free, ₦50 stamp duty
// Stamp duty applies to every interbank transfer regardless of tier.
// Intra-Vestara transfers: no fee, no stamp duty.
// =============================================

const TRANSFER_FEE = 20;
const STAMP_DUTY = 50;

interface TransferFeeQuote {
  tier: 1 | 2 | 3 | 4;
  tier_label: string;
  wallet_balance: number;
  free_quota: number;          // -1 = unlimited
  used_this_month: number;
  free_remaining: number;      // -1 = unlimited
  transfer_fee: number;
  stamp_duty: number;
  total_fees: number;
  amount: number;
  total_debit: number;         // amount + total_fees
  transferType: "intra" | "inter";
}

function watMonthKey(d: Date = new Date()): string {
  // WAT = UTC+1
  const wat = new Date(d.getTime() + 60 * 60 * 1000);
  const y = wat.getUTCFullYear();
  const m = String(wat.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function computeFeeTier(walletBalance: number): {
  tier: 1 | 2 | 3 | 4;
  tier_label: string;
  free_quota: number;
} {
  if (walletBalance < 10_000) return { tier: 1, tier_label: "Tier 1 (<₦10k)", free_quota: 0 };
  if (walletBalance < 50_000) return { tier: 2, tier_label: "Tier 2 (₦10k–₦49.9k)", free_quota: 5 };
  if (walletBalance < 200_000) return { tier: 3, tier_label: "Tier 3 (₦50k–₦199k)", free_quota: 15 };
  return { tier: 4, tier_label: "Tier 4 (₦200k+)", free_quota: -1 };
}

async function getMonthlyInterCount(
  admin: ReturnType<typeof createClient>,
  userId: string,
  monthKey: string,
): Promise<number> {
  const { data } = await admin
    .from("transfer_fee_counters")
    .select("inter_count")
    .eq("user_id", userId)
    .eq("month_key", monthKey)
    .maybeSingle();
  return Number((data as { inter_count?: number } | null)?.inter_count ?? 0);
}

async function quoteTransferFees(
  admin: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  transferType: "intra" | "inter",
): Promise<TransferFeeQuote> {
  // Vestara's immutable ledger is the spendable-balance source of truth.
  // VFD sub-account balances can be swept to the pool and are audit-only.
  const snap = await getVestaraSettlementSnapshot(admin, userId);
  const walletBalance = Number(snap.walletBalance || 0);

  if (transferType === "intra") {
    return {
      tier: 1, tier_label: "Intra-Vestara (no fee)", wallet_balance: walletBalance,
      free_quota: -1, used_this_month: 0, free_remaining: -1,
      transfer_fee: 0, stamp_duty: 0, total_fees: 0,
      amount, total_debit: amount, transferType,
    };
  }

  const { tier, tier_label, free_quota } = computeFeeTier(walletBalance);
  const used = await getMonthlyInterCount(admin, userId, watMonthKey());
  const free_remaining = free_quota === -1 ? -1 : Math.max(0, free_quota - used);
  const transfer_fee = free_quota === -1 || used < free_quota ? 0 : TRANSFER_FEE;
  // Tier 4 wording says "Unlimited" (free). Tier 1 has no free, always ₦20.
  // Tiers 2/3: free quota then ₦20 thereafter.
  if (tier === 4) {
    return {
      tier, tier_label, wallet_balance: walletBalance,
      free_quota: -1, used_this_month: used, free_remaining: -1,
      transfer_fee: 0, stamp_duty: STAMP_DUTY, total_fees: STAMP_DUTY,
      amount, total_debit: amount + STAMP_DUTY, transferType,
    };
  }
  const fees = transfer_fee + STAMP_DUTY;
  return {
    tier, tier_label, wallet_balance: walletBalance,
    free_quota, used_this_month: used, free_remaining,
    transfer_fee, stamp_duty: STAMP_DUTY, total_fees: fees,
    amount, total_debit: amount + fees, transferType,
  };
}

// Debit fees from sender wallet → settlement, log in vestara_fee_ledger,
// and increment the monthly inter counter. Best-effort: errors are logged but
// do not fail the parent transfer (the user-facing money already moved).
async function chargeTransferFees(
  admin: ReturnType<typeof createClient>,
  userId: string,
  reference: string,
  quote: TransferFeeQuote,
): Promise<void> {
  try {
    if (quote.transferType === "intra") return;

    if (quote.transfer_fee > 0) {
      const { error: feeErr } = await admin.rpc("vestara_withdraw", {
        _user_id: userId,
        _amount: quote.transfer_fee,
        _reference: `${reference}-FEE`,
        _metadata: { source: "interbank_transfer_fee", parent_reference: reference, tier: quote.tier },
      });
      if (feeErr) console.error("[chargeTransferFees] fee withdraw failed:", feeErr);
      else {
        await admin.from("vestara_fee_ledger").insert({
          user_id: userId, fee_type: "transfer_fee", amount: quote.transfer_fee,
          reference: `${reference}-FEE`, tx_reference: reference,
          transfer_type: "inter",
          metadata: { tier: quote.tier, tier_label: quote.tier_label, wallet_balance: quote.wallet_balance },
        });
      }
    }

    if (quote.stamp_duty > 0) {
      const { error: sdErr } = await admin.rpc("vestara_withdraw", {
        _user_id: userId,
        _amount: quote.stamp_duty,
        _reference: `${reference}-SD`,
        _metadata: { source: "stamp_duty", parent_reference: reference },
      });
      if (sdErr) console.error("[chargeTransferFees] stamp duty withdraw failed:", sdErr);
      else {
        await admin.from("vestara_fee_ledger").insert({
          user_id: userId, fee_type: "stamp_duty", amount: quote.stamp_duty,
          reference: `${reference}-SD`, tx_reference: reference,
          transfer_type: "inter",
          metadata: { tier: quote.tier },
        });
      }
    }

    // Increment monthly counter (upsert)
    const monthKey = watMonthKey();
    const current = await getMonthlyInterCount(admin, userId, monthKey);
    await admin.from("transfer_fee_counters").upsert({
      user_id: userId,
      month_key: monthKey,
      inter_count: current + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,month_key" });
  } catch (err) {
    console.error("[chargeTransferFees] unexpected error:", err);
  }
}

async function handleQuoteTransfer(userId: string, body: Record<string, unknown>) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResponse({ error: "Invalid amount" }, 400);
  }
  const bankCode = body.bankCode as string || "";
  const transferType: "intra" | "inter" =
    (body.transferType as "intra" | "inter") ||
    (bankCode === "999999" || (body.toAccount as string || "").startsWith("9") ? "intra" : "inter");
  const admin = getSupabaseAdmin();
  const quote = await quoteTransferFees(admin, userId, amount, transferType);
  return jsonResponse({ data: quote });
}

// Initiate Transfer - Full VFD transfer payload
async function handleTransfer(
  userId: string,
  body: Record<string, unknown>
) {
  let fromAccount = body.fromAccount as string;
  const toAccount = body.toAccount as string;

  if (!fromAccount || !toAccount) {
    return jsonResponse({ error: "fromAccount and toAccount are required" }, 400);
  }

  // Block self-transfer (would otherwise hit VFD as pool→pool and fail with status 99)
  if (fromAccount === toAccount) {
    return jsonResponse(
      { error: "You cannot transfer to your own account.", code: "SELF_TRANSFER_BLOCKED" },
      400
    );
  }

  // SECURITY: prevent users from transferring from accounts they don't own.
  // assertOwnsAccount will also reject if the user has no NUBAN yet.
  try {
    await assertOwnsAccount(userId, fromAccount);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "unauthorized" },
      403
    );
  }

  // Resolve caller's stored NUBAN. If it's a sandbox virtual NUBAN
  // (issued because VFD echoed the pool for the shared test BVN), translate
  // the outgoing fromAccount to the real PLATFORM_POOL_NUBAN before calling
  // VFD — Vestara's ledger still attributes the debit to this user.
  let displayFromAccount = fromAccount;
  {
    const adminClient = getSupabaseAdmin();
    const { data: caller } = await adminClient
      .from("vfd_sandbox_clients")
      .select("vfd_account_number, metadata")
      .eq("user_id", userId)
      .maybeSingle();
    const callerNuban = caller?.vfd_account_number as string | null | undefined;
    const isVirtual = !!(caller?.metadata as Record<string, unknown> | null)?.virtual_nuban;
    if (!callerNuban || callerNuban !== fromAccount) {
      return jsonResponse(
        {
          error: "Your VFD account isn't fully provisioned yet. Please complete KYC to activate your account.",
          code: "NUBAN_NOT_PROVISIONED",
        },
        403
      );
    }
    if (isVirtual) {
      // Swap the virtual NUBAN for the real pool NUBAN for the VFD call.
      // displayFromAccount keeps the user-facing virtual NUBAN.
      fromAccount = PLATFORM_POOL_NUBAN;
    }
  }

  // ─── EARLY AMOUNT + KYC TIER LIMIT ENFORCEMENT ───
  // Must run BEFORE the intra-virtual short-circuit and BEFORE the
  // insufficient-balance check so users get the most informative reason
  // (tier limit + upgrade prompt) rather than a generic balance error.
  {
    const _amt = Number(body.amount);
    if (!Number.isFinite(_amt) || _amt <= 0) {
      return jsonResponse({ error: "Enter a valid amount greater than zero." }, 400);
    }
    if (_amt > 5_000_000) {
      return jsonResponse(
        {
          error: "This transfer exceeds the ₦5,000,000 per-transaction limit. Please split it into smaller transfers.",
          code: "PER_TXN_LIMIT_EXCEEDED",
          limit: 5_000_000,
        },
        403,
      );
    }

    const adminClientT = getSupabaseAdmin();
    const { data: clientRowT } = await adminClientT
      .from("vfd_sandbox_clients")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();

    const tierT = (clientRowT?.tier as string | undefined) || "tier1";
    const TIER_DAILY_CAP_T: Record<string, number> = {
      tier1: 30_000,
      tier2: 100_000,
      tier3: Number.POSITIVE_INFINITY,
    };
    const dailyCapT = TIER_DAILY_CAP_T[tierT] ?? 30_000;
    const tierLabel = tierT.replace("tier", "Tier ");

    if (Number.isFinite(dailyCapT)) {
      if (_amt > dailyCapT) {
        return jsonResponse(
          {
            error: `This ₦${_amt.toLocaleString()} transfer is above your ${tierLabel} limit of ₦${dailyCapT.toLocaleString()} per 24 hours. Upgrade your KYC to unlock higher limits.`,
            code: "TIER_LIMIT_EXCEEDED",
            tier: tierT,
            limit: dailyCapT,
            action: "upgrade_kyc",
          },
          403,
        );
      }
      const sinceT = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: todaysT } = await adminClientT
        .from("vfd_sandbox_transactions")
        .select("amount")
        .eq("user_id", userId)
        .in("transaction_type", ["transfer", "debit"])
        .eq("status", "completed")
        .gte("created_at", sinceT);
      const spentTodayT = (todaysT ?? []).reduce(
        (s, r) => s + Number((r as { amount?: number }).amount || 0),
        0,
      );
      if (spentTodayT + _amt > dailyCapT) {
        const remainingT = Math.max(0, dailyCapT - spentTodayT);
        return jsonResponse(
          {
            error: `Your ₦${_amt.toLocaleString()} transfer can't go through. You've already sent ₦${spentTodayT.toLocaleString()} in the last 24 hours, which is at or above your ${tierLabel} daily limit of ₦${dailyCapT.toLocaleString()}. Only ₦${remainingT.toLocaleString()} is available right now. Upgrade your KYC to unlock higher limits.`,
            code: "TIER_DAILY_LIMIT_EXCEEDED",
            tier: tierT,
            limit: dailyCapT,
            spent: spentTodayT,
            remaining: remainingT,
            action: "upgrade_kyc",
          },
          403,
        );
      }
    }
  }
  // ─── END EARLY TIER ENFORCEMENT ───

  // ─── SANDBOX VIRTUAL→VIRTUAL SHORT-CIRCUIT ───
  // Virtual NUBANs (9xxxxxxxxx) all settle to the shared PLATFORM_POOL_NUBAN
  // on VFD, so a VFD /transfer call would be pool→pool (rejected). Resolve
  // the recipient locally and record the move purely on our internal ledger.
  if (toAccount.startsWith("9")) {
    const adminClient2 = getSupabaseAdmin();
    const { data: recipient } = await adminClient2
      .from("vfd_sandbox_clients")
      .select("user_id, full_name, vfd_account_number")
      .eq("vfd_account_number", toAccount)
      .maybeSingle();
    if (recipient?.user_id) {
      const amountNum2 = Number(body.amount);
      if (!Number.isFinite(amountNum2) || amountNum2 <= 0) {
        return jsonResponse({ error: "Invalid amount" }, 400);
      }
      // Use the Vestara wallet ledger as the single source of truth for the
      // sender's available balance. The vfd_sandbox_transactions mirror can
      // drift (especially for legacy/refunded rows) and must NEVER be used to
      // gate a money-moving operation — see money-movement-model.md.
      const senderSnapshot = await getVestaraSettlementSnapshot(adminClient2, userId);
      const senderBal = senderSnapshot.walletBalance;
      if (senderBal < amountNum2) {
        const shortfall = amountNum2 - senderBal;
        return jsonResponse(
          {
            error: `You need ₦${amountNum2.toLocaleString()} but only have ₦${senderBal.toLocaleString()} available. Please fund your wallet with at least ₦${shortfall.toLocaleString()} and try again.`,
            code: "INSUFFICIENT_BALANCE",
            required: amountNum2,
            available: senderBal,
            shortfall,
          },
          400
        );
      }
      const walletPrefix2 = Deno.env.get("VFD_WALLET_NAME") || "VFD";
      const ref2 = `${walletPrefix2}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const narration = (body.narration as string) || (body.remark as string) || "Transfer";
      const benName = (body.beneficiaryName as string) || recipient.full_name || toAccount;
      const recipientBefore = await getVestaraSettlementSnapshot(adminClient2, recipient.user_id);

      // ─── ATOMIC SENDER DEBIT FIRST ───
      // Previously only the recipient was credited via vestara_deposit; the
      // sender was never debited on the Vestara ledger, so the next sync wiped
      // any cache-only debit. We now post a proper double-entry withdrawal
      // (sender wallet → settlement) before crediting the recipient.
      const { data: senderWdData, error: senderWdErr } = await adminClient2.rpc("vestara_withdraw", {
        _user_id: userId,
        _amount: amountNum2,
        _reference: `${ref2}-OUT`,
        _metadata: {
          source: "intra_virtual_transfer",
          to_user_id: recipient.user_id,
          from_account: displayFromAccount,
          to_account: toAccount,
          narration,
        },
      });
      const senderWdResult = senderWdData as { success?: boolean; error?: string } | null;
      if (senderWdErr || !senderWdResult?.success) {
        console.error("[intra-virtual] sender vestara_withdraw failed:", senderWdErr || senderWdResult);
        await adminClient2.from("intra_transfer_reports").insert({
          reference: ref2,
          sender_user_id: userId,
          recipient_user_id: recipient.user_id,
          from_account: displayFromAccount,
          to_account: toAccount,
          amount: amountNum2,
          narration,
          settlement_status: "vestara_failed",
          sender_balance_before: senderBal,
          sender_balance_after: senderBal,
          recipient_balance_before: recipientBefore.walletBalance,
          recipient_balance_after: recipientBefore.walletBalance,
          metadata: { error: senderWdErr?.message || senderWdResult?.error || "Sender debit failed", stage: "sender_withdraw" },
        });
        return jsonResponse(
          { data: { status: "99", message: "Internal settlement failed; funds were not moved." }, reference: ref2 },
          500,
        );
      }

      const { data: depositData, error: depositErr } = await adminClient2.rpc("vestara_deposit", {
        _user_id: recipient.user_id,
        _amount: amountNum2,
        _reference: `${ref2}-IN`,
        _metadata: {
          source: "intra_virtual_transfer",
          from_user_id: userId,
          from_account: displayFromAccount,
          to_account: toAccount,
          narration,
          sender_name: benName,
        },
      });

      const depositResult = depositData as { success?: boolean; transaction_id?: string; error?: string } | null;
      if (depositErr || !depositResult?.success) {
        console.error("[intra-virtual] vestara_deposit failed for recipient:", depositErr || depositResult);
        // Reverse the sender debit so funds aren't trapped in settlement.
        const { error: reverseErr } = await adminClient2.rpc("vestara_deposit", {
          _user_id: userId,
          _amount: amountNum2,
          _reference: `${ref2}-OUT-REVERSAL`,
          _metadata: {
            source: "intra_virtual_transfer_reversal",
            original_reference: `${ref2}-OUT`,
            reason: depositErr?.message || depositResult?.error || "recipient_deposit_failed",
          },
        });
        if (reverseErr) console.error("[intra-virtual] CRITICAL: sender reversal failed:", reverseErr);
        await adminClient2.from("intra_transfer_reports").insert({
          reference: ref2,
          sender_user_id: userId,
          recipient_user_id: recipient.user_id,
          from_account: displayFromAccount,
          to_account: toAccount,
          amount: amountNum2,
          narration,
          settlement_status: reverseErr ? "vestara_failed_unreversed" : "vestara_failed",
          sender_balance_before: senderBal,
          sender_balance_after: reverseErr ? senderBal - amountNum2 : senderBal,
          recipient_balance_before: recipientBefore.walletBalance,
          recipient_balance_after: recipientBefore.walletBalance,
          metadata: { error: depositErr?.message || depositResult?.error || "Vestara deposit failed", stage: "recipient_deposit" },
        });
        return jsonResponse(
          { data: { status: "99", message: "Internal settlement failed; funds were not moved." }, reference: ref2 },
          500,
        );
      }

      const recipientAfter = await getVestaraSettlementSnapshot(adminClient2, recipient.user_id);
      await Promise.all([
        syncBalanceCachesFromVestara(adminClient2, userId),
        syncBalanceCachesFromVestara(adminClient2, recipient.user_id),
      ]);

      const { data: senderTx, error: senderTxErr } = await adminClient2.from("vfd_sandbox_transactions").insert({
        user_id: userId,
        vfd_account_number: displayFromAccount,
        amount: amountNum2,
        transaction_type: "transfer",
        status: "completed",
        reference: ref2,
        beneficiary_account: toAccount,
        beneficiary_bank_code: (body.bankCode as string) || "999999",
        beneficiary_name: benName,
        description: narration,
        metadata: { intra_virtual: true },
        source: "vfd_sandbox",
      }).select("id").single();
      if (senderTxErr) console.error("[intra-virtual] sender tx insert failed:", senderTxErr);

      const { data: recipientTx, error: recipientTxErr } = await adminClient2.from("vfd_sandbox_transactions").insert({
        user_id: recipient.user_id,
        vfd_account_number: toAccount,
        amount: amountNum2,
        transaction_type: "credit",
        status: "completed",
        reference: `${ref2}-IN`,
        beneficiary_account: displayFromAccount,
        beneficiary_bank_code: "999999",
        beneficiary_name: benName,
        description: `Received from ${displayFromAccount}: ${narration}`,
        metadata: { intra_virtual: true, from_user_id: userId },
        source: "vfd_sandbox",
      }).select("id").single();
      if (recipientTxErr) console.error("[intra-virtual] recipient tx insert failed:", recipientTxErr);

      await adminClient2.from("intra_transfer_reports").insert({
        reference: ref2,
        sender_user_id: userId,
        recipient_user_id: recipient.user_id,
        from_account: displayFromAccount,
        to_account: toAccount,
        amount: amountNum2,
        narration,
        sender_vfd_transaction_id: senderTx?.id ?? null,
        recipient_vfd_transaction_id: recipientTx?.id ?? null,
        recipient_vestara_transaction_id: depositResult.transaction_id ?? null,
        settlement_status: "completed",
        sender_balance_before: senderBal,
        sender_balance_after: senderBal - amountNum2,
        recipient_balance_before: recipientBefore.walletBalance,
        recipient_balance_after: recipientAfter.walletBalance,
        metadata: { intra_virtual: true },
      });

      await logSettlementBalanceAudit(adminClient2, {
        user_id: recipient.user_id,
        account_number: toAccount,
        event_type: "intra_virtual_transfer_credit",
        reference: `${ref2}-IN`,
        vestara_transaction_id: depositResult.transaction_id ?? null,
        vfd_transaction_id: recipientTx?.id ?? null,
        amount: amountNum2,
        wallet_balance_before: recipientBefore.walletBalance,
        wallet_balance_after: recipientAfter.walletBalance,
        settlement_balance_before: recipientBefore.settlementBalance,
        settlement_balance_after: recipientAfter.settlementBalance,
        legacy_wallet_balance_after: recipientAfter.walletBalance,
        metadata: { from_user_id: userId, from_account: displayFromAccount, to_account: toAccount, narration },
      });

      try {
        await adminClient2.from("vfd_sandbox_notifications").insert([
          {
            user_id: userId,
            title: "Transfer sent",
            message: `₦${amountNum2.toLocaleString()} sent to ${benName}. Ref: ${ref2}`,
            notification_type: "transfer_sent",
          },
          {
            user_id: recipient.user_id,
            title: "Money received",
            message: `₦${amountNum2.toLocaleString()} received from ${displayFromAccount}.`,
            notification_type: "wallet_credit",
          },
        ]);
      } catch (_) { /* best-effort */ }

      return jsonResponse({
        data: { status: "00", message: "Transfer successful", txnId: ref2 },
        vfd_status: 200,
        reference: ref2,
      });
    }
  }





  // SECURITY: amount validation + cap
  const amountNum = Number(body.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return jsonResponse({ error: "Invalid amount" }, 400);
  }
  if (amountNum > 5_000_000) {
    return jsonResponse({ error: "Amount exceeds per-transfer limit (₦5,000,000)" }, 400);
  }

  // ─── KYC TIER LIMIT ENFORCEMENT (per VFD Microfinance Bank policy) ───
  // Tier 1: ₦30,000 cumulative daily debit
  // Tier 2: ₦100,000 cumulative daily debit
  // Tier 3: no daily cap (per-txn ₦5M already enforced above)
  {
    const adminClient = getSupabaseAdmin();
    const { data: clientRow } = await adminClient
      .from("vfd_sandbox_clients")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();

    const tier = (clientRow?.tier as string | undefined) || "tier1";
    const TIER_DAILY_CAP: Record<string, number> = {
      tier1: 30_000,
      tier2: 100_000,
      tier3: Number.POSITIVE_INFINITY,
    };
    const dailyCap = TIER_DAILY_CAP[tier] ?? 30_000;

    if (Number.isFinite(dailyCap)) {
      // Single-transfer guard: at Tier 1/2, per-txn cannot exceed the daily cap
      if (amountNum > dailyCap) {
        return jsonResponse(
          {
            error: `This transfer exceeds your ${tier.toUpperCase()} limit of ₦${dailyCap.toLocaleString()}. Upgrade your KYC tier to unlock higher limits.`,
            code: "TIER_LIMIT_EXCEEDED",
            tier,
            limit: dailyCap,
          },
          403
        );
      }

      // Cumulative daily debit (transfers only, completed) in the last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: todays } = await adminClient
        .from("vfd_sandbox_transactions")
        .select("amount")
        .eq("user_id", userId)
        .eq("transaction_type", "transfer")
        .eq("status", "completed")
        .gte("created_at", since);

      const spentToday = (todays ?? []).reduce(
        (s, r) => s + Number((r as { amount?: number }).amount || 0),
        0
      );
      if (spentToday + amountNum > dailyCap) {
        const remaining = Math.max(0, dailyCap - spentToday);
        return jsonResponse(
          {
            error: `Daily limit reached. ${tier.toUpperCase()} allows ₦${dailyCap.toLocaleString()} per 24h (₦${remaining.toLocaleString()} remaining). Upgrade your KYC tier for higher limits.`,
            code: "TIER_DAILY_LIMIT_EXCEEDED",
            tier,
            limit: dailyCap,
            spent: spentToday,
            remaining,
          },
          403
        );
      }
    }
  }
  // ─── END TIER ENFORCEMENT ───

  // Step 1: ALWAYS enquire on the user's OWN sub-account NUBAN
  // (displayFromAccount) — never on the pool/settlement account. VFD's
  // /account/enquiry returns the sub-account's internal savings id which
  // /transfer requires as `uniqueSenderAccountId`. Sending the pool's id, the
  // NUBAN itself, or an empty value yields status 98 "Invalid
  // uniqueSenderAccountId".
  const senderEnquiryNuban = displayFromAccount;
  if (senderEnquiryNuban === PLATFORM_POOL_NUBAN) {
    return jsonResponse({
      error: "Refusing to enquire on the settlement/pool account as a sender.",
      code: "SENDER_IS_POOL",
    }, 400);
  }
  const { data: senderEnquiry, status: senderStatus } = await vfdRequest("/account/enquiry", "GET", undefined, {
    accountNumber: senderEnquiryNuban,
  });

  if (senderStatus !== 200 || (senderEnquiry as Record<string, unknown>)?.status !== "00") {
    return jsonResponse({ error: "Could not retrieve sender account details", data: senderEnquiry }, 400);
  }

  // VFD response shape can be either { data: { accountId, ... } } or
  // { data: { account: { id, ... } } } depending on endpoint version.
  const senderEnvelope = (senderEnquiry as Record<string, unknown>)?.data as Record<string, unknown>;
  const senderAccountObj = (senderEnvelope?.account as Record<string, unknown> | undefined) || senderEnvelope;
  const senderData = senderEnvelope;
  const senderSavingsId =
    (senderAccountObj?.id?.toString?.() ||
      senderEnvelope?.accountId?.toString?.() ||
      "");

  if (!senderSavingsId) {
    return jsonResponse({
      error: "VFD enquiry returned no account id for the sender sub-account.",
      data: senderEnquiry,
    }, 400);
  }

  // Sanity: the enquiry must be for the user's own sub-account NUBAN,
  // never the pool. Catches any accidental substitution upstream.
  const enquiredNuban = (senderAccountObj?.accountNo?.toString?.() ||
    senderEnvelope?.accountNo?.toString?.() ||
    "");
  if (enquiredNuban && enquiredNuban !== senderEnquiryNuban) {
    return jsonResponse({
      error: "Sender enquiry returned a different NUBAN than requested.",
      code: "SENDER_ENQUIRY_MISMATCH",
      expected: senderEnquiryNuban,
      got: enquiredNuban,
    }, 400);
  }

  // Step 2: Generate signature (use the user sub-account NUBAN, matches /transfer fromAccount)
  const signature = await generateTransferSignature(senderEnquiryNuban, toAccount);

  // Step 3: Build VFD transfer payload
  const walletPrefix = Deno.env.get("VFD_WALLET_NAME") || "VFD";
  const reference = body.reference as string || `${walletPrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  // VFD: bankCode "999999" = intra-bank (within VFD); anything else = inter-bank
  const transferType = (body.transferType as string) || (body.bankCode === "999999" ? "intra" : "inter");

  // For INTRA transfers VFD requires toSavingsId / toClientId / toBvn.
  // Enrich from beneficiary enquiry if caller didn't provide them.
  let toClientId = body.toClientId as string || "";
  let toSavingsId = body.toSavingsId as string || "";
  let toBvn = body.toBvn as string || "";
  let toClient = body.beneficiaryName as string || body.toClient as string || "";

  if (transferType === "intra" && (!toSavingsId || !toClientId)) {
    const { data: benEnquiry, status: benStatus } = await vfdRequest("/account/enquiry", "GET", undefined, {
      accountNumber: toAccount,
    });
    if (benStatus === 200 && (benEnquiry as Record<string, unknown>)?.status === "00") {
      const bdEnv = (benEnquiry as Record<string, unknown>).data as Record<string, unknown>;
      const bdAcct = (bdEnv?.account as Record<string, unknown> | undefined) || bdEnv;
      toClientId = toClientId || bdEnv?.clientId?.toString() || bdAcct?.clientId?.toString() || "";
      toSavingsId = toSavingsId || bdAcct?.id?.toString() || bdEnv?.accountId?.toString() || "";
      toBvn = toBvn || bdEnv?.bvn?.toString() || "";
      toClient = toClient || bdEnv?.client?.toString() || bdAcct?.client?.toString() || "";
    } else {
      return jsonResponse({ error: "Could not retrieve beneficiary VFD account details for intra transfer", data: benEnquiry }, 400);
    }
  }

  const transferPayload: Record<string, unknown> = {
    // fromAccount must be the user sub-account's own NUBAN, matching the
    // enquiry above — NOT the pool/settlement NUBAN.
    fromAccount: senderEnquiryNuban,
    fromClientId: senderData?.clientId?.toString() || "",
    fromClient: senderData?.client?.toString() || "",
    fromSavingsId: senderSavingsId,
    fromBvn: senderData?.bvn?.toString() || "",
    toAccount,
    toBank: body.bankCode as string || "",
    toClient,
    toClientId,
    toSavingsId,
    toSession: body.toSession as string || "",
    toBvn,
    signature,
    amount: String(body.amount),
    remark: body.narration as string || body.remark as string || "Transfer",
    transferType,
    reference,
    // ALWAYS the sender sub-account's internal savings id from the fresh
    // enquiry above. Never a NUBAN, never blank, never the pool's id.
    uniqueSenderAccountId: senderSavingsId,
  };

  console.log("[VFD Transfer] Payload:", JSON.stringify(transferPayload));

  const supabaseAdmin = getSupabaseAdmin();

  // ─── PHASE 1: reserve idempotency key + insert tx as `reserved` BEFORE
  // hitting VFD. If the network drops mid-call, the row survives so the
  // webhook (or a retry with the same reference) can commit/reverse it
  // without double-debiting.
  const idemKey = (body.idempotency_key as string) || reference;
  const idem = await reserveIdempotencyKey(supabaseAdmin, {
    key: idemKey,
    userId,
    action: "transfer",
    reference,
  });

  if (idem.mode === "replay") {
    const cached = idem.row.response as Record<string, unknown> | null;
    console.log("[VFD Transfer] replay for idempotency key", idemKey);
    return jsonResponse(
      {
        data: cached ?? { status: idem.row.status, message: "Replayed from idempotency cache" },
        vfd_status: idem.row.http_status ?? 200,
        reference,
        replayed: true,
      },
      200
    );
  }

  // Insert tx in RESERVED state — sender's available balance drops now
  // (getRecordedSandboxBalance counts `reserved` debits/transfers).
  const { data: reservedTx } = await supabaseAdmin
    .from("vfd_sandbox_transactions")
    .insert({
      user_id: userId,
      vfd_account_number: displayFromAccount,
      amount: Number(body.amount),
      transaction_type: "transfer",
      status: "reserved",
      reference,
      idempotency_key: idemKey,
      reserved_at: new Date().toISOString(),
      beneficiary_account: toAccount,
      beneficiary_bank_code: body.bankCode as string,
      beneficiary_name: body.beneficiaryName as string || body.toClient as string,
      description: body.narration as string || body.remark as string || "Transfer",
      metadata: { stage: "reserved", transferType },
      source: "vfd_sandbox",
    })
    .select("id")
    .maybeSingle();

  await recordTxEvent(supabaseAdmin, {
    transaction_id: reservedTx?.id ?? null,
    user_id: userId,
    reference,
    event_type: "tx.reserved",
    actor: "user",
    to_status: "reserved",
    payload: { amount: Number(body.amount), transferType, beneficiary: toAccount },
  });

  // Call VFD — failures here keep tx `reserved` for the webhook to resolve.
  let data: unknown;
  let status = 0;
  let networkError: Error | null = null;
  try {
    const result = await vfdRequest("/transfer", "POST", transferPayload);
    data = result.data;
    status = result.status;
  } catch (err) {
    networkError = err instanceof Error ? err : new Error(String(err));
    console.error("[VFD Transfer] network error:", networkError.message);
  }

  if (networkError) {
    // Unknown outcome — leave the tx in `reserved`. Idempotency cache stays
    // pending so a retry with the same reference is safe. Webhook or
    // reconciliation will settle it.
    await settleIdempotencyKey(supabaseAdmin, idemKey, {
      status: "pending",
      response: { error: networkError.message },
      http_status: null,
    });
    await recordTxEvent(supabaseAdmin, {
      transaction_id: reservedTx?.id ?? null,
      user_id: userId,
      reference,
      event_type: "vfd.network_error",
      from_status: "reserved",
      to_status: "reserved",
      payload: { error: networkError.message },
    });
    return jsonResponse(
      {
        error: "Transfer is processing. We'll confirm the outcome shortly.",
        code: "TRANSFER_PENDING",
        reference,
      },
      202
    );
  }

  const vfdData = data as Record<string, unknown>;
  const isSuccess = vfdData?.status === "00";
  const vfdInner = (vfdData?.data as Record<string, unknown> | undefined) || {};
  // VFD echoes our client `reference` as `txnId`. The real VFD-issued
  // identifier is `data.reference` (numeric) with `bankTransactionId` as a
  // secondary identifier. Prefer those for `vfd_reference`; only fall back to
  // `txnId` if it differs from the client reference we submitted.
  const vfdInnerTxnId = vfdInner?.txnId?.toString() ?? null;
  const vfdInnerReference = (vfdInner?.reference as string | number | undefined)?.toString() || null;
  const vfdBankTxnId =
    (vfdInner?.bankTransactionId as string | undefined)?.toString() ||
    (vfdInner?.BankTransactionId as string | undefined)?.toString() ||
    null;
  const vfdTxnId =
    vfdInnerReference ||
    vfdBankTxnId ||
    (vfdInnerTxnId && vfdInnerTxnId !== reference ? vfdInnerTxnId : null);
  // VFD returns the NIBSS session id alongside txnId; capture every common spelling.
  const sessionId =
    (vfdInner?.sessionId as string | undefined)?.toString() ||
    (vfdInner?.SessionId as string | undefined)?.toString() ||
    (vfdInner?.sessionID as string | undefined)?.toString() ||
    (vfdData?.sessionId as string | undefined)?.toString() ||
    null;
  const nowIso = new Date().toISOString();

  // Transition the reserved tx → completed or reversed.
  await supabaseAdmin
    .from("vfd_sandbox_transactions")
    .update({
      status: isSuccess ? "completed" : "reversed",
      committed_at: isSuccess ? nowIso : null,
      reversed_at: isSuccess ? null : nowIso,
      vfd_reference: vfdTxnId,
      session_id: sessionId,
      metadata: {
        ...(data as Record<string, unknown>),
        stage: isSuccess ? "committed" : "reversed",
        session_id: sessionId,
        bank_transaction_id: vfdBankTxnId,
        vfd_reference: vfdInnerReference,
      },
    })
    .eq("id", reservedTx?.id);

  await recordTxEvent(supabaseAdmin, {
    transaction_id: reservedTx?.id ?? null,
    user_id: userId,
    reference,
    event_type: isSuccess ? "tx.committed" : "tx.reversed",
    actor: "vfd_response",
    from_status: "reserved",
    to_status: isSuccess ? "completed" : "reversed",
    payload: { vfd_status: vfdData?.status, vfd_txn_id: vfdTxnId },
  });

  await settleIdempotencyKey(supabaseAdmin, idemKey, {
    status: isSuccess ? "completed" : "failed",
    response: data,
    http_status: status,
  });

  if (isSuccess) {
    await ensureBalanceRow(supabaseAdmin, userId, {
      accountNo: displayFromAccount,
      preserveExisting: false,
    });

    // ─── POST-TRANSFER TSQ ───
    // /transfer (intra) omits sessionId; /transfer (inter) sometimes omits
    // bankTransactionId. Hit /transactions once to capture both into the row
    // before any webhook arrives. Fire-and-forget — failures here don't
    // unwind the (already-committed) transfer.
    await (async () => {
      try {
        const tsqParams: Record<string, string> = { reference };
        if (sessionId) tsqParams.sessionId = sessionId;
        const { data: tsq } = await vfdRequest("/transactions", "GET", undefined, tsqParams);
        const tsqInner = (tsq as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        const tsqSessionId =
          (tsqInner?.sessionId as string | undefined) ||
          (tsqInner?.SessionId as string | undefined) ||
          sessionId || null;
        const tsqBankTxnId =
          (tsqInner?.bankTransactionId as string | undefined) ||
          (tsqInner?.BankTransactionId as string | undefined) || null;
        const tsqReference =
          (tsqInner?.reference as string | number | undefined)?.toString() || null;
        const tsqInnerTxnId =
          (tsqInner?.TxnId as string | undefined) ||
          (tsqInner?.txnId as string | undefined) || null;
        // Same precedence as the main path: real VFD reference > bank txn id >
        // echoed txnId (only if it differs from our client reference).
        const tsqTxnId =
          tsqReference ||
          tsqBankTxnId ||
          (tsqInnerTxnId && tsqInnerTxnId !== reference ? tsqInnerTxnId : null) ||
          vfdTxnId;
        if (reservedTx?.id && (tsqSessionId || tsqBankTxnId || tsqTxnId)) {
          await supabaseAdmin
            .from("vfd_sandbox_transactions")
            .update({
              session_id: tsqSessionId,
              vfd_reference: tsqTxnId,
              metadata: {
                ...(data as Record<string, unknown>),
                stage: "committed",
                session_id: tsqSessionId,
                bank_transaction_id: tsqBankTxnId,
                vfd_reference: tsqReference,
                tsq_response: tsq,
              },
            })
            .eq("id", reservedTx.id);
        }
      } catch (err) {
        console.warn("[VFD Transfer] post-transfer TSQ failed:", err instanceof Error ? err.message : String(err));
      }
    })();

    // ─── HYBRID LEDGER MIRROR ───
    // VFD has already moved real money between NUBANs. Mirror the movement on
    // the Vestara double-entry ledger so groups/savings/audit stay accurate,
    // and ensure recipient sees the credit in their history + notifications.
    try {
      // Sender debit on Vestara wallet (mirrors VFD debit).
      const { data: senderWd, error: senderWdErr } = await supabaseAdmin.rpc("vestara_withdraw", {
        _user_id: userId,
        _amount: Number(body.amount),
        _reference: `${reference}-OUT`,
        _metadata: {
          source: "vfd_transfer_mirror",
          transfer_type: transferType,
          from_account: displayFromAccount,
          to_account: toAccount,
          bank_code: body.bankCode as string,
          beneficiary_name: body.beneficiaryName ?? null,
          vfd_reference: vfdTxnId,
          session_id: sessionId,
        },
      });
      const senderWdRes = senderWd as { success?: boolean; error?: string } | null;
      if (senderWdErr || !senderWdRes?.success) {
        console.error("[VFD Transfer] sender vestara_withdraw mirror failed:", senderWdErr || senderWdRes);
      }

      // If the recipient is a Vestara user (intra-Vestara), credit their
      // Vestara wallet, insert a credit transaction row for history, push a
      // notification, and refresh their cached VFD balance row.
      const { data: rcptClient } = await supabaseAdmin
        .from("vfd_sandbox_clients")
        .select("user_id, full_name, vfd_account_number")
        .eq("vfd_account_number", toAccount)
        .maybeSingle();
      const rcptUserId = (rcptClient as { user_id?: string } | null)?.user_id;
      if (rcptUserId) {
        const { data: rcptDep, error: rcptDepErr } = await supabaseAdmin.rpc("vestara_deposit", {
          _user_id: rcptUserId,
          _amount: Number(body.amount),
          _reference: `${reference}-IN`,
          _metadata: {
            source: "vfd_transfer_mirror",
            transfer_type: transferType,
            from_user_id: userId,
            from_account: displayFromAccount,
            to_account: toAccount,
            sender_name: body.beneficiaryName ?? null,
            vfd_reference: vfdTxnId,
            session_id: sessionId,
          },
        });
        const rcptDepRes = rcptDep as { success?: boolean; error?: string } | null;
        if (rcptDepErr || !rcptDepRes?.success) {
          console.error("[VFD Transfer] recipient vestara_deposit mirror failed:", rcptDepErr || rcptDepRes);
        }

        // Insert a credit row in vfd_sandbox_transactions for recipient's history.
        await supabaseAdmin.from("vfd_sandbox_transactions").insert({
          user_id: rcptUserId,
          vfd_account_number: toAccount,
          amount: Number(body.amount),
          transaction_type: "credit",
          status: "completed",
          reference: `${reference}-IN`,
          vfd_reference: vfdTxnId,
          session_id: sessionId,
          beneficiary_account: displayFromAccount,
          beneficiary_name: body.beneficiaryName ?? null,
          description: (body.narration as string) || "Transfer received",
          committed_at: nowIso,
          metadata: {
            source: "vfd_transfer_mirror",
            from_user_id: userId,
            session_id: sessionId,
            bank_transaction_id: vfdTxnId,
          },
        });

        // Refresh recipient's cached VFD balance.
        await ensureBalanceRow(supabaseAdmin, rcptUserId, {
          accountNo: toAccount,
          preserveExisting: false,
        });

        // Notify recipient.
        try {
          await supabaseAdmin.from("vfd_sandbox_notifications").insert({
            user_id: rcptUserId,
            title: "Money received",
            message: `You received ₦${Number(body.amount).toLocaleString()} from ${body.beneficiaryName || displayFromAccount}. Ref: ${reference}`,
            notification_type: "transfer_received",
          });
        } catch (_) { /* best-effort */ }
      }
    } catch (mirrorErr) {
      console.error("[VFD Transfer] hybrid ledger mirror error:", mirrorErr);
    }



    // ─── INTERBANK FEE + STAMP DUTY ───
    // Only inter (NIBSS) transfers incur fee + stamp duty. Intra transfers are
    // routed through the virtual-account short-circuit above and never reach
    // this path with transferType === "inter".
    let feeQuote: TransferFeeQuote | null = null;
    if (transferType === "inter") {
      feeQuote = await quoteTransferFees(supabaseAdmin, userId, Number(body.amount), "inter");
      await chargeTransferFees(supabaseAdmin, userId, reference, feeQuote);
    }

    try {
      const feeNote = feeQuote && feeQuote.total_fees > 0
        ? ` (fee ₦${feeQuote.transfer_fee} + stamp duty ₦${feeQuote.stamp_duty})`
        : "";
      await supabaseAdmin.from("vfd_sandbox_notifications").insert({
        user_id: userId,
        title: "Transfer sent",
        message: `₦${Number(body.amount).toLocaleString()} sent to ${body.beneficiaryName || toAccount}${feeNote}. Ref: ${reference}`,
        notification_type: "transfer_sent",
      });
    } catch (_) { /* best-effort */ }
  } else {
    try {
      await supabaseAdmin.from("vfd_sandbox_notifications").insert({
        user_id: userId,
        title: "Transfer failed",
        message: `Transfer of ₦${Number(body.amount).toLocaleString()} to ${body.beneficiaryName || toAccount} could not be processed.`,
        notification_type: "transfer_failed",
      });
    } catch (_) { /* best-effort */ }
  }

  return jsonResponse({
    data,
    vfd_status: status,
    reference,
    vfd_reference: vfdTxnId,
    session_id: sessionId,
    bank_transaction_id: vfdBankTxnId,
  });
}

// Sandbox Credit - per VFD docs requires senderAccountNo and senderBank
async function handleSandboxCredit(userId: string, accountNo: string, amount: number) {
  // SECURITY: validate amount and enforce per-txn / per-day caps
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResponse({ error: "Invalid amount" }, 400);
  }
  if (amount > SANDBOX_CREDIT_MAX_PER_TXN) {
    return jsonResponse(
      { error: `Sandbox credit per-transaction limit is ₦${SANDBOX_CREDIT_MAX_PER_TXN.toLocaleString()}` },
      400
    );
  }

  // SECURITY: prevent users from crediting accounts they don't own
  try {
    await assertOwnsAccount(userId, accountNo);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "unauthorized" },
      403
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  // SECURITY: per-day cap across all sandbox credits for this user
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("vfd_sandbox_transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("transaction_type", "credit")
    .eq("status", "completed")
    .gte("created_at", since);
  const usedToday = (recent ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
  if (usedToday + amount > SANDBOX_CREDIT_MAX_PER_DAY) {
    return jsonResponse(
      { error: `Daily sandbox credit limit (₦${SANDBOX_CREDIT_MAX_PER_DAY.toLocaleString()}) exceeded` },
      429
    );
  }

  const reference = `VFD-credit-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const ledgerReference = reference;

  // ─── PHASE 1: idempotency for sandbox credit ───
  const idemKey = reference;
  const idem = await reserveIdempotencyKey(supabaseAdmin, {
    key: idemKey,
    userId,
    action: "sandbox_credit",
    reference,
  });

  if (idem.mode === "replay") {
    const cached = idem.row.response as Record<string, unknown> | null;
    return jsonResponse(
      {
        data: cached ?? { status: idem.row.status, message: "Replayed from idempotency cache" },
        vfd_status: idem.row.http_status ?? 200,
        reference,
        replayed: true,
      },
      200
    );
  }

  let data: unknown;
  let status = 0;
  let networkError: Error | null = null;
  try {
    const result = await vfdRequest("/credit", "POST", {
      amount: String(amount),
      accountNo,
      senderAccountNo: "5050104070",
      senderBank: "000002",
      senderNarration: `Sandbox test credit - ${reference}`,
    });
    data = result.data;
    status = result.status;
  } catch (err) {
    networkError = err instanceof Error ? err : new Error(String(err));
  }

  if (networkError) {
    await settleIdempotencyKey(supabaseAdmin, idemKey, {
      status: "pending",
      response: { error: networkError.message },
      http_status: null,
    });
    return jsonResponse(
      { error: "Credit is processing. Refresh in a moment.", code: "CREDIT_PENDING", reference },
      202
    );
  }

  const vfdData = data as Record<string, unknown>;
  const isSuccess = vfdData?.status === "00";

  await supabaseAdmin.from("vfd_sandbox_transactions").insert({
    user_id: userId,
    vfd_account_number: accountNo,
    amount,
    transaction_type: "credit",
    status: isSuccess ? "completed" : "failed",
    reference,
    idempotency_key: idemKey,
    committed_at: isSuccess ? new Date().toISOString() : null,
    description: "Sandbox test credit",
    metadata: data as Record<string, unknown>,
    source: "vfd_sandbox",
  });

  await recordTxEvent(supabaseAdmin, {
    user_id: userId,
    reference,
    event_type: isSuccess ? "credit.committed" : "credit.failed",
    actor: "user",
    to_status: isSuccess ? "completed" : "failed",
    payload: { amount, accountNo, vfd_status: vfdData?.status },
  });

  await settleIdempotencyKey(supabaseAdmin, idemKey, {
    status: isSuccess ? "completed" : "failed",
    response: data,
    http_status: status,
  });

  // Auto-settle internal ledger after successful VFD sandbox credit. The VFD
  // history row alone is not spendable balance; Vestara's double-entry ledger
  // is the authoritative wallet balance used by dashboard + transfer checks.
  if (isSuccess) {
    const { data: ledgerDeposit, error: ledgerErr } = await supabaseAdmin.rpc("vestara_deposit", {
      _user_id: userId,
      _amount: amount,
      _reference: ledgerReference,
      _metadata: {
        source: "vfd_sandbox_credit",
        vfd_reference: reference,
        account_no: accountNo,
        vfd_response: data,
      },
    });
    const ledgerResult = ledgerDeposit as { success?: boolean; error?: string } | null;
    if (ledgerErr || !ledgerResult?.success) {
      console.error("[VFD sandbox_credit] vestara_deposit failed:", ledgerErr || ledgerResult);
      await supabaseAdmin
        .from("vfd_sandbox_transactions")
        .update({
          status: "failed",
          metadata: { ...(data as Record<string, unknown>), ledger_error: ledgerErr?.message || ledgerResult?.error || "ledger_deposit_failed" },
        })
        .eq("reference", reference);
      await settleIdempotencyKey(supabaseAdmin, idemKey, {
        status: "failed",
        response: { error: "Ledger settlement failed", vfd_response: data },
        http_status: status,
      });
      return jsonResponse({ error: "Credit could not be settled. Please try again.", code: "LEDGER_SETTLEMENT_FAILED", reference }, 500);
    }

    await ensureBalanceRow(supabaseAdmin, userId, {
      accountNo,
      preserveExisting: false,
    });
    try {
      await supabaseAdmin.from("vfd_sandbox_notifications").insert({
        user_id: userId,
        title: "Wallet funded",
        message: `₦${Number(amount).toLocaleString()} credited to your sandbox wallet. Ref: ${reference}`,
        notification_type: "wallet_credit",
      });
    } catch (_) { /* best-effort */ }
  }

  return jsonResponse({ data, vfd_status: status, reference });
}

// Virtual Account Creation
async function handleCreateVirtualAccount(userId: string, body: Record<string, unknown>) {
  const { data, status } = await vfdRequest("/virtualaccount", "POST", body);
  return jsonResponse({ data, vfd_status: status });
}

// Transaction Status Query
async function handleTransactionStatusQuery(reference?: string, sessionId?: string) {
  const params: Record<string, string> = {};
  if (reference) params.reference = reference;
  if (sessionId) params.sessionId = sessionId;

  if (!reference && !sessionId) {
    return jsonResponse({ error: "reference or sessionId is required" }, 400);
  }

  const { data, status } = await vfdRequest("/transactions", "GET", undefined, params);
  return jsonResponse({ data, vfd_status: status });
}

// Sub-accounts listing
async function handleSubAccounts(entity: string = "individual", page: string = "0", size: string = "20") {
  const { data, status } = await vfdRequest("/sub-accounts", "GET", undefined, { entity, page, size });
  return jsonResponse({ data, vfd_status: status });
}

// Constant-time string compare to avoid timing side-channels on secret comparison.
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Webhook handler (no auth required)
async function handleWebhook(req: Request) {
  // SECURITY: verify shared-secret header before accepting webhook payloads
  const expected = Deno.env.get("VFD_WEBHOOK_SECRET");
  const provided =
    req.headers.get("x-vfd-signature") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (!expected) {
    console.error("[VFD Webhook] VFD_WEBHOOK_SECRET not configured; rejecting payload");
    return jsonResponse({ error: "Webhook not configured" }, 503);
  }
  if (!timingSafeEqual(provided, expected)) {
    console.warn("[VFD Webhook] invalid signature");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Reject oversized payloads (defense against memory-exhaustion abuse)
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 256 * 1024) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  let payload: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.length > 256 * 1024) return jsonResponse({ error: "Payload too large" }, 413);
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const supabaseAdmin = getSupabaseAdmin();
  const eventType = (payload?.event as string) || (payload?.type as string) || "unknown";

  // Always log every received webhook for audit.
  await supabaseAdmin.from("vfd_sandbox_webhook_logs").insert({
    event_type: eventType,
    payload,
    processed: false,
  });

  console.log("[VFD Webhook]", JSON.stringify(payload));

  // VFD docs use snake_case for inward-credit fields; transfer status webhooks
  // (if VFD ever ships them) tend toward camelCase under `data`. Normalise both.
  const inner = (payload?.data as Record<string, unknown>) ?? {};
  const pickStr = (...vals: unknown[]) =>
    vals.map(v => (v === undefined || v === null ? "" : String(v))).find(v => v.length > 0) ?? null;

  const reference = pickStr(
    payload?.reference, inner?.reference,
    payload?.txnId, inner?.txnId, payload?.TxnId, inner?.TxnId,
  );
  const sessionId = pickStr(
    payload?.session_id, payload?.sessionId, payload?.SessionId,
    inner?.session_id, inner?.sessionId, inner?.SessionId,
  );
  const vfdStatus = pickStr(
    payload?.status, inner?.status,
    payload?.transactionStatus, inner?.transactionStatus,
  );
  const accountNumber = pickStr(payload?.account_number, payload?.accountNumber, inner?.account_number, inner?.accountNumber);
  const amount = Number(payload?.amount ?? inner?.amount ?? 0);

  // ─── INWARD CREDIT: VFD pushes funding notifications (NIP/USSD/NQR) here ───
  // Detect by presence of an account_number + originator_* fields and no
  // pre-existing reserved tx in our DB.
  const looksLikeInwardCredit =
    !!accountNumber && amount > 0 &&
    (payload?.originator_account_number || payload?.originator_account_name ||
     payload?.transaction_channel || payload?.initialCreditRequest);

  try {
    if (looksLikeInwardCredit) {
      // Idempotency: dedupe on session_id (preferred) or reference.
      const dedupeKey = sessionId || reference;
      if (dedupeKey) {
        const { data: existing } = await supabaseAdmin
          .from("vfd_sandbox_transactions")
          .select("id")
          .or(`session_id.eq.${dedupeKey},reference.eq.${dedupeKey}`)
          .maybeSingle();
        if (existing) {
          return jsonResponse({ status: "duplicate_ignored", reference: dedupeKey });
        }
      }

      // Map account → user
      const { data: client } = await supabaseAdmin
        .from("vfd_sandbox_clients")
        .select("user_id")
        .eq("vfd_account_number", accountNumber)
        .maybeSingle();

      if (!client?.user_id) {
        await pushWebhookToDlq(supabaseAdmin, {
          event_type: "inward_credit",
          reference,
          payload,
          error: `No user mapped to account ${accountNumber}`,
        });
        return jsonResponse({ status: "received", queued: "dlq" });
      }

      const nowIso = new Date().toISOString();
      const { data: creditRow } = await supabaseAdmin
        .from("vfd_sandbox_transactions")
        .insert({
          user_id: client.user_id,
          vfd_account_number: accountNumber,
          amount,
          transaction_type: "credit",
          status: "completed",
          reference: reference || `INWARD-${sessionId || crypto.randomUUID()}`,
          session_id: sessionId,
          committed_at: nowIso,
          description: (payload?.originator_narration as string) || "Inward credit",
          metadata: {
            ...(payload as Record<string, unknown>),
            stage: "inward_credit",
            originator_account_number: payload?.originator_account_number ?? null,
            originator_account_name: payload?.originator_account_name ?? null,
            originator_bank: payload?.originator_bank ?? null,
            transaction_channel: payload?.transaction_channel ?? null,
          },
          source: "vfd_webhook",
        })
        .select("id")
        .maybeSingle();

      await recordTxEvent(supabaseAdmin, {
        transaction_id: creditRow?.id ?? null,
        user_id: client.user_id,
        reference,
        event_type: "webhook.inward_credit",
        actor: "webhook",
        to_status: "completed",
        payload: { amount, session_id: sessionId, channel: payload?.transaction_channel ?? null },
      });

      // Refresh balance cache so dashboards see funds immediately.
      await ensureBalanceRow(supabaseAdmin, client.user_id, {
        accountNo: accountNumber,
        preserveExisting: false,
      });

      try {
        await supabaseAdmin.from("vfd_sandbox_notifications").insert({
          user_id: client.user_id,
          title: "Funds received",
          message: `₦${amount.toLocaleString()} received from ${payload?.originator_account_name || "external sender"}.`,
          notification_type: "credit_received",
        });
      } catch (_) { /* best-effort */ }

      return jsonResponse({ status: "processed", outcome: "credited", reference, session_id: sessionId });
    }

    // ─── OUTWARD STATUS WEBHOOK (or transfer notification) ───
    if (!reference && !sessionId) {
      await pushWebhookToDlq(supabaseAdmin, {
        event_type: eventType,
        reference: null,
        payload,
        error: "Webhook missing reference and session_id",
      });
      return jsonResponse({ status: "received", queued: "dlq" });
    }

    let txQuery = supabaseAdmin
      .from("vfd_sandbox_transactions")
      .select("id, status, user_id, amount, vfd_account_number, beneficiary_name, beneficiary_account");
    if (reference) txQuery = txQuery.eq("reference", reference);
    else txQuery = txQuery.eq("session_id", sessionId!);
    const { data: tx } = await txQuery.maybeSingle();

    if (!tx) {
      await pushWebhookToDlq(supabaseAdmin, {
        event_type: eventType,
        reference,
        payload,
        error: "No transaction found for reference/session_id",
      });
      return jsonResponse({ status: "received", queued: "dlq" });
    }

    // Terminal-state guard — webhook deliveries can duplicate; never re-apply.
    if (tx.status === "completed" || tx.status === "reversed" || tx.status === "failed") {
      return jsonResponse({ status: "duplicate_ignored", reference });
    }

    const success = vfdStatus === "00" || /success|completed/i.test(vfdStatus ?? "");
    const nowIso = new Date().toISOString();

    await supabaseAdmin
      .from("vfd_sandbox_transactions")
      .update({
        status: success ? "completed" : "reversed",
        committed_at: success ? nowIso : null,
        reversed_at: success ? null : nowIso,
        session_id: sessionId ?? undefined,
        metadata: { ...(payload as Record<string, unknown>), stage: success ? "webhook_committed" : "webhook_reversed" },
      })
      .eq("id", tx.id);

    await recordTxEvent(supabaseAdmin, {
      transaction_id: tx.id,
      user_id: tx.user_id,
      reference,
      event_type: success ? "webhook.committed" : "webhook.reversed",
      actor: "webhook",
      from_status: "reserved",
      to_status: success ? "completed" : "reversed",
      payload: { vfd_status: vfdStatus, event: eventType, session_id: sessionId },
    });

    if (tx.user_id) {
      await ensureBalanceRow(supabaseAdmin, tx.user_id, {
        accountNo: tx.vfd_account_number ?? null,
        preserveExisting: false,
      });
    }

    try {
      if (tx.user_id) {
        await supabaseAdmin.from("vfd_sandbox_notifications").insert({
          user_id: tx.user_id,
          title: success ? "Transfer confirmed" : "Transfer reversed",
          message: success
            ? `₦${Number(tx.amount).toLocaleString()} to ${tx.beneficiary_name || tx.beneficiary_account} confirmed.`
            : `₦${Number(tx.amount).toLocaleString()} to ${tx.beneficiary_name || tx.beneficiary_account} was reversed and refunded.`,
          notification_type: success ? "transfer_confirmed" : "transfer_reversed",
        });
      }
    } catch (_) { /* best-effort */ }

    return jsonResponse({ status: "processed", reference, outcome: success ? "completed" : "reversed" });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("[VFD Webhook] processing error:", err);
    await pushWebhookToDlq(supabaseAdmin, {
      event_type: eventType,
      reference,
      payload,
      error: err,
    });
    return jsonResponse({ status: "received", queued: "dlq" });
  }
}

// Get user's VFD client data from DB
async function handleGetClient(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("vfd_sandbox_clients")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  return jsonResponse({ data });
}

// Get user's VFD transactions from DB
async function handleGetTransactions(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("vfd_sandbox_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  return jsonResponse({ data });
}

// ─── LOCK FUNDS HANDLERS ─────────────────────────────────────────

// Get lock configs
async function handleGetLockConfigs() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("vfd_lock_configs")
    .select("*")
    .eq("is_active", true)
    .order("duration_months", { ascending: true });

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

// Get user balance — Vestara ledger is the source of truth for display.
//
// Rationale (POOL wallet model): VFD provisions every user NUBAN as a
// sub-account of the corporate pool (1001695610). Inflows to a sub-account
// are auto-swept upstream, so VFD `/account/enquiry` against a user NUBAN
// is NOT a reliable display balance. We use the Vestara double-entry
// ledger (vestara_accounts.balance for account_type='wallet') as the
// display truth, and keep the live VFD figure only as audit metadata.
//
//   • Real VFD-provisioned NUBANs ("1xxxxxxxxx") → display = ledger
//     wallet balance. VFD live balance recorded in metadata for drift
//     detection (see vfd-pool-reconciler).
//   • Virtual platform NUBANs ("9xxxxxxxxx") → no real VFD account,
//     display = ledger wallet balance (still authoritative), with
//     `no_vfd_account: true`.
async function handleGetUserBalance(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: client } = await supabaseAdmin
    .from("vfd_sandbox_clients")
    .select("vfd_account_number")
    .eq("user_id", userId)
    .maybeSingle();

  const accountNo = client?.vfd_account_number ?? null;
  const isVirtualNuban = !!accountNo && accountNo.startsWith("9");
  const hasRealNuban = !!accountNo && !isVirtualNuban;

  // Ledger-derived wallet balance (source of truth for display).
  const { data: walletAcct } = await supabaseAdmin
    .from("vestara_accounts")
    .select("balance")
    .eq("user_id", userId)
    .eq("account_type", "wallet")
    .maybeSingle();
  const ledgerWalletBalance = toNumber(walletAcct?.balance);

  // Lock + savings still tracked separately in vfd_user_balances.
  const { data: existing } = await supabaseAdmin
    .from("vfd_user_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const lockedBalance = toNumber(existing?.locked_balance);
  const savingsBalance = toNumber(existing?.savings_balance);

  // Optional: capture live VFD figure for audit only (do NOT use for display).
  let vfdLiveBalance: number | null = null;
  let vfdOk = false;
  if (hasRealNuban) {
    try {
      const res = await vfdRequest("/account/enquiry", "GET", undefined, {
        accountNumber: accountNo,
      });
      const parsedStatus = (res.data as { status?: string } | null)?.status;
      if (res.status === 200 && parsedStatus === "00") {
        vfdLiveBalance = extractVfdBalance(res.data);
        vfdOk = true;
      }
    } catch (err) {
      console.error("[VFD get_user_balance] audit enquiry failed", err);
    }
  }

  const totalBalance = ledgerWalletBalance;
  const availableBalance = Math.max(totalBalance - lockedBalance - savingsBalance, 0);
  const timestamp = new Date().toISOString();

  // Persist cache (ledger-truth) for fast follow-up reads.
  if (existing) {
    await supabaseAdmin
      .from("vfd_user_balances")
      .update({
        total_balance: totalBalance,
        locked_balance: lockedBalance,
        savings_balance: savingsBalance,
        last_synced_at: timestamp,
        updated_at: timestamp,
      })
      .eq("user_id", userId);
  } else {
    await supabaseAdmin.from("vfd_user_balances").insert({
      user_id: userId,
      total_balance: totalBalance,
      locked_balance: lockedBalance,
      savings_balance: savingsBalance,
      last_synced_at: timestamp,
    });
  }

  return jsonResponse({
    data: {
      user_id: userId,
      vfd_account_number: accountNo,
      total_balance: totalBalance,
      available_balance: availableBalance,
      locked_balance: lockedBalance,
      savings_balance: savingsBalance,
      last_synced_at: timestamp,
      source: "vestara_ledger",
      no_vfd_account: !hasRealNuban,
      vfd_audit: hasRealNuban
        ? { live_balance: vfdLiveBalance, ok: vfdOk, swept_to_pool: vfdOk && vfdLiveBalance !== null && vfdLiveBalance < totalBalance }
        : null,
    },
  });
}


// Sync VFD balance to internal ledger
async function handleSyncBalance(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  // Get VFD account
  const { data: client } = await supabaseAdmin
    .from("vfd_sandbox_clients")
    .select("vfd_account_number")
    .eq("user_id", userId)
    .maybeSingle();

  if (!client?.vfd_account_number) {
    return jsonResponse({ error: "No VFD account found" }, 400);
  }

  const { balance, liveBalance, recordedBalance } = await ensureBalanceRow(supabaseAdmin, userId, {
    accountNo: client.vfd_account_number,
    preserveExisting: true,
  });

  return jsonResponse({ data: balance, vfd_balance: liveBalance, recorded_balance: recordedBalance });
}

// Create a lock
async function handleCreateLock(userId: string, body: Record<string, unknown>) {
  const amount = Number(body.amount);
  const durationMonths = Number(body.duration_months);

  if (!amount || amount <= 0) return jsonResponse({ error: "Invalid amount" }, 400);
  if (!durationMonths) return jsonResponse({ error: "Invalid duration" }, 400);

  const supabaseAdmin = getSupabaseAdmin();

  // Get config
  const { data: config } = await supabaseAdmin
    .from("vfd_lock_configs")
    .select("*")
    .eq("duration_months", durationMonths)
    .eq("is_active", true)
    .maybeSingle();

  if (!config) return jsonResponse({ error: "Invalid lock duration" }, 400);

  const { balance } = await ensureBalanceRow(supabaseAdmin, userId, { preserveExisting: true });

  if (!balance) return jsonResponse({ error: "No balance record. Please sync your balance first." }, 400);

  const availableBalance = Math.max(
    toNumber(balance.available_balance) ||
      (toNumber(balance.total_balance) - toNumber(balance.locked_balance) - toNumber(balance.savings_balance)),
    0
  );
  if (amount > availableBalance) {
    const shortfall = Math.max(0, amount - availableBalance);
    return jsonResponse({
      error: `Insufficient wallet balance to lock. You need ₦${amount.toLocaleString()} but have ₦${availableBalance.toLocaleString()} available. Please fund your wallet with at least ₦${shortfall.toLocaleString()}.`,
      code: "INSUFFICIENT_BALANCE",
      required: amount,
      available: availableBalance,
      shortfall,
    }, 400);
  }

  // Calculate interest (simple interest)
  const interestRate = Number(config.interest_rate);
  const expectedInterest = amount * (interestRate / 100) * (durationMonths / 12);
  const totalPayout = amount + expectedInterest;

  const maturityDate = new Date();
  maturityDate.setMonth(maturityDate.getMonth() + durationMonths);

  // Create lock record
  const { data: lock, error: lockErr } = await supabaseAdmin
    .from("vfd_locked_funds")
    .insert({
      user_id: userId,
      principal_amount: amount,
      interest_rate: interestRate,
      duration_months: durationMonths,
      expected_interest: Math.round(expectedInterest * 100) / 100,
      total_payout: Math.round(totalPayout * 100) / 100,
      maturity_date: maturityDate.toISOString(),
      status: "active",
      source: "vfd_sandbox",
    })
    .select()
    .single();

  if (lockErr) return jsonResponse({ error: lockErr.message }, 500);

  // Update balances
  const newLocked = Number(balance.locked_balance) + amount;
  await supabaseAdmin
    .from("vfd_user_balances")
    .update({
      locked_balance: newLocked,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  // Ledger entry
  const productName = `Locked Savings · ${durationMonths}mo @ ${interestRate}% p.a.`;
  const lockDesc = `${productName}: locked ₦${amount.toLocaleString()}`;
  await supabaseAdmin.from("vfd_lock_ledger").insert({
    user_id: userId,
    lock_id: lock.id,
    entry_type: "lock_created",
    amount,
    balance_before: availableBalance,
    balance_after: availableBalance - amount,
    locked_before: Number(balance.locked_balance),
    locked_after: newLocked,
    description: lockDesc,
  });

  try {
    await supabaseAdmin.from("vfd_sandbox_transactions").insert({
      user_id: userId, transaction_type: "debit", amount,
      description: lockDesc, reference: `lock-${lock.id}`, status: "completed",
    });
    await supabaseAdmin.from("vfd_sandbox_notifications").insert({
      user_id: userId,
      title: "Funds locked",
      message: `${productName}: ₦${amount.toLocaleString()} locked. Expected interest at maturity: ₦${Math.round(expectedInterest * 100) / 100}.`,
      notification_type: "lock_created",
    });
  } catch (_) { /* best-effort */ }

  return jsonResponse({ data: { ...lock, product: productName } });
}

// Get user's locked funds
async function handleGetLockedFunds(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("vfd_locked_funds")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

// Unlock matured funds
async function handleUnlockFunds(userId: string, lockId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: lock } = await supabaseAdmin
    .from("vfd_locked_funds")
    .select("*")
    .eq("id", lockId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!lock) return jsonResponse({ error: "Lock not found" }, 404);
  if (lock.status !== "active") return jsonResponse({ error: "Lock is not active" }, 400);

  const now = new Date();
  const maturity = new Date(lock.maturity_date);
  const isMatured = now >= maturity;

  if (!isMatured) {
    return jsonResponse({ error: "Lock has not matured yet. Use break_lock for early withdrawal." }, 400);
  }

  // Credit principal + interest
  const { data: balance } = await supabaseAdmin
    .from("vfd_user_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!balance) return jsonResponse({ error: "No balance record" }, 500);

  const creditAmount = Number(lock.total_payout);
  const newLocked = Number(balance.locked_balance) - Number(lock.principal_amount);

  await supabaseAdmin
    .from("vfd_user_balances")
    .update({
      total_balance: Number(balance.total_balance) + Number(lock.expected_interest),
      locked_balance: Math.max(0, newLocked),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  // Update lock status
  await supabaseAdmin
    .from("vfd_locked_funds")
    .update({
      status: "matured",
      actual_unlock_date: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", lockId);

  // Ledger
  const availBefore = Number(balance.total_balance) - Number(balance.locked_balance) - Number(balance.savings_balance);
  const productName = `Locked Savings · ${lock.duration_months}mo @ ${lock.interest_rate}% p.a.`;
  const matureDesc = `${productName} matured: ₦${Number(lock.principal_amount).toLocaleString()} principal + ₦${Number(lock.expected_interest).toLocaleString()} interest`;
  await supabaseAdmin.from("vfd_lock_ledger").insert({
    user_id: userId,
    lock_id: lockId,
    entry_type: "lock_matured",
    amount: creditAmount,
    balance_before: availBefore,
    balance_after: availBefore + creditAmount,
    locked_before: Number(balance.locked_balance),
    locked_after: Math.max(0, newLocked),
    description: matureDesc,
  });

  // Mirror to sandbox history + notify (so it shows up in transaction history with
  // product name attached, and the user sees an in-app notification for every txn)
  try {
    await supabaseAdmin.from("vfd_sandbox_transactions").insert({
      user_id: userId,
      transaction_type: "credit",
      amount: creditAmount,
      description: matureDesc,
      reference: `lock-mature-${lockId}`,
      status: "completed",
    });
    await supabaseAdmin.from("vfd_sandbox_notifications").insert({
      user_id: userId,
      title: "Interest credited",
      message: `${productName}: ₦${Number(lock.expected_interest).toLocaleString()} interest credited along with ₦${Number(lock.principal_amount).toLocaleString()} principal.`,
      notification_type: "interest_accrued",
    });
  } catch (_) { /* notifications are best-effort */ }

  return jsonResponse({ data: { unlocked: creditAmount, interest_earned: Number(lock.expected_interest), product: productName } });
}

// Break lock (early withdrawal)
async function handleBreakLock(userId: string, lockId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: lock } = await supabaseAdmin
    .from("vfd_locked_funds")
    .select("*")
    .eq("id", lockId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!lock) return jsonResponse({ error: "Lock not found" }, 404);
  if (lock.status !== "active") return jsonResponse({ error: "Lock is not active" }, 400);

  // Get penalty config
  const { data: config } = await supabaseAdmin
    .from("vfd_lock_configs")
    .select("early_withdrawal_penalty")
    .eq("duration_months", lock.duration_months)
    .maybeSingle();

  const penaltyPercent = Number(config?.early_withdrawal_penalty || 100);
  const penaltyAmount = Number(lock.expected_interest) * (penaltyPercent / 100);
  const netInterest = Number(lock.expected_interest) - penaltyAmount;
  const creditAmount = Number(lock.principal_amount) + Math.max(0, netInterest);

  const { data: balance } = await supabaseAdmin
    .from("vfd_user_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!balance) return jsonResponse({ error: "No balance record" }, 500);

  const newLocked = Number(balance.locked_balance) - Number(lock.principal_amount);
  const interestToAdd = Math.max(0, netInterest);

  await supabaseAdmin
    .from("vfd_user_balances")
    .update({
      total_balance: Number(balance.total_balance) + interestToAdd,
      locked_balance: Math.max(0, newLocked),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  const now = new Date();
  await supabaseAdmin
    .from("vfd_locked_funds")
    .update({
      status: "broken",
      actual_unlock_date: now.toISOString(),
      penalty_amount: penaltyAmount,
      updated_at: now.toISOString(),
    })
    .eq("id", lockId);

  const availBefore = Number(balance.total_balance) - Number(balance.locked_balance) - Number(balance.savings_balance);
  const productName = `Locked Savings · ${lock.duration_months}mo @ ${lock.interest_rate}% p.a.`;
  const breakDesc = `${productName} early withdrawal: ₦${Number(lock.principal_amount).toLocaleString()} principal, penalty ₦${penaltyAmount.toLocaleString()}, net interest ₦${Math.max(0, netInterest).toLocaleString()}`;
  await supabaseAdmin.from("vfd_lock_ledger").insert({
    user_id: userId,
    lock_id: lockId,
    entry_type: "lock_broken",
    amount: creditAmount,
    balance_before: availBefore,
    balance_after: availBefore + creditAmount,
    locked_before: Number(balance.locked_balance),
    locked_after: Math.max(0, newLocked),
    description: breakDesc,
  });

  try {
    await supabaseAdmin.from("vfd_sandbox_transactions").insert({
      user_id: userId, transaction_type: "credit", amount: creditAmount,
      description: breakDesc, reference: `lock-break-${lockId}`, status: "completed",
    });
    await supabaseAdmin.from("vfd_sandbox_notifications").insert({
      user_id: userId,
      title: "Early withdrawal processed",
      message: `${productName}: ₦${creditAmount.toLocaleString()} credited. Penalty: ₦${penaltyAmount.toLocaleString()}.`,
      notification_type: "lock_broken",
    });
  } catch (_) { /* best-effort */ }

  return jsonResponse({
    data: {
      unlocked: creditAmount,
      penalty: penaltyAmount,
      net_interest: Math.max(0, netInterest),
      penalty_percent: penaltyPercent,
    },
  });
}

// Get lock ledger
async function handleGetLockLedger(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("vfd_lock_ledger")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}


// ─── PHASE 2: RECONCILIATION SWEEP ───
// Find transactions stuck in `reserved` and ask VFD for the real outcome
// via /transactions. Commit / reverse / leave-pending based on the response.
async function processStuckReservedTransactions(opts: { olderThanMinutes?: number; limit?: number } = {}) {
  const supabaseAdmin = getSupabaseAdmin();
  const olderThan = opts.olderThanMinutes ?? 5;
  const limit = Math.min(opts.limit ?? 50, 200);
  const cutoff = new Date(Date.now() - olderThan * 60 * 1000).toISOString();

  const { data: stuck, error } = await supabaseAdmin
    .from("vfd_sandbox_transactions")
    .select("id, user_id, amount, reference, session_id, vfd_reference, vfd_account_number, beneficiary_name, beneficiary_account, idempotency_key, status")
    .in("status", ["reserved", "pending"])
    .lt("reserved_at", cutoff)
    .order("reserved_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[Reconcile] query error:", error.message);
    return { scanned: 0, committed: 0, reversed: 0, still_pending: 0, errors: [error.message] };
  }

  const errors: string[] = [];
  let committed = 0;
  let reversed = 0;
  let pending = 0;

  for (const tx of stuck ?? []) {
    if (!tx.reference && !tx.session_id) {
      pending++;
      continue;
    }
    try {
      // Prefer sessionId (more authoritative on NIBSS) when we captured it.
      const tsqParams: Record<string, string> = {};
      if (tx.session_id) tsqParams.sessionId = tx.session_id;
      else if (tx.reference) tsqParams.reference = tx.reference;
      const { data: query } = await vfdRequest("/transactions", "GET", undefined, tsqParams);
      const inner = (query as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      const vfdStatus = (inner?.transactionStatus as string) || (inner?.status as string) || (query as Record<string, unknown>)?.status as string;
      const txnId = (inner?.txnId ?? inner?.sessionId)?.toString() ?? null;
      const success = vfdStatus === "00" || /success|completed/i.test(vfdStatus ?? "");
      const failed = /fail|reverse|declin/i.test(vfdStatus ?? "");
      const nowIso = new Date().toISOString();

      if (success) {
        await supabaseAdmin.from("vfd_sandbox_transactions").update({
          status: "completed",
          committed_at: nowIso,
          vfd_reference: txnId,
          metadata: { ...(query as Record<string, unknown>), stage: "reconciled_committed" },
        }).eq("id", tx.id);
        await recordTxEvent(supabaseAdmin, {
          transaction_id: tx.id, user_id: tx.user_id, reference: tx.reference,
          event_type: "reconcile.committed", actor: "cron",
          from_status: tx.status ?? "reserved", to_status: "completed",
          payload: { vfd_status: vfdStatus, vfd_txn_id: txnId },
        });
        if (tx.user_id) {
          await ensureBalanceRow(supabaseAdmin, tx.user_id, { accountNo: tx.vfd_account_number ?? null, preserveExisting: false });
          await supabaseAdmin.from("vfd_sandbox_notifications").insert({
            user_id: tx.user_id,
            title: "Transfer confirmed",
            message: `₦${Number(tx.amount).toLocaleString()} to ${tx.beneficiary_name || tx.beneficiary_account} confirmed.`,
            notification_type: "transfer_confirmed",
          }).then(() => {}, () => {});
        }
        if (tx.idempotency_key) {
          await settleIdempotencyKey(supabaseAdmin, tx.idempotency_key, { status: "completed", response: query, http_status: 200 });
        }
        committed++;
      } else if (failed) {
        await supabaseAdmin.from("vfd_sandbox_transactions").update({
          status: "reversed",
          reversed_at: nowIso,
          metadata: { ...(query as Record<string, unknown>), stage: "reconciled_reversed" },
        }).eq("id", tx.id);
        await recordTxEvent(supabaseAdmin, {
          transaction_id: tx.id, user_id: tx.user_id, reference: tx.reference,
          event_type: "reconcile.reversed", actor: "cron",
          from_status: tx.status ?? "reserved", to_status: "reversed",
          payload: { vfd_status: vfdStatus },
        });
        if (tx.user_id) {
          await ensureBalanceRow(supabaseAdmin, tx.user_id, { accountNo: tx.vfd_account_number ?? null, preserveExisting: false });
          await supabaseAdmin.from("vfd_sandbox_notifications").insert({
            user_id: tx.user_id,
            title: "Transfer reversed",
            message: `₦${Number(tx.amount).toLocaleString()} to ${tx.beneficiary_name || tx.beneficiary_account} was reversed and refunded.`,
            notification_type: "transfer_reversed",
          }).then(() => {}, () => {});
        }
        if (tx.idempotency_key) {
          await settleIdempotencyKey(supabaseAdmin, tx.idempotency_key, { status: "failed", response: query, http_status: 200 });
        }
        reversed++;
      } else {
        pending++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${tx.reference}: ${msg}`);
    }
  }

  await supabaseAdmin.from("vfd_sandbox_webhook_logs").insert({
    event_type: "reconciliation_sweep",
    payload: { scanned: stuck?.length ?? 0, committed, reversed, still_pending: pending, older_than_minutes: olderThan, errors },
    processed: true,
    processed_at: new Date().toISOString(),
  });

  return { scanned: stuck?.length ?? 0, committed, reversed, still_pending: pending, errors };
}

async function handleDlqList(userId: string, limit = 50) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some(r => ["admin", "super_admin"].includes(r.role as string));
  if (!isAdmin) return jsonResponse({ error: "Admin only" }, 403);
  const { data, error } = await supabaseAdmin
    .from("vfd_webhook_dlq")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

async function handleDlqReplay(userId: string, dlqId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some(r => ["admin", "super_admin"].includes(r.role as string));
  if (!isAdmin) return jsonResponse({ error: "Admin only" }, 403);

  const { data: entry } = await supabaseAdmin.from("vfd_webhook_dlq").select("*").eq("id", dlqId).maybeSingle();
  if (!entry) return jsonResponse({ error: "DLQ entry not found" }, 404);

  // Re-invoke webhook processing using stored payload + a fresh secret-signed request.
  const secret = Deno.env.get("VFD_WEBHOOK_SECRET");
  if (!secret) return jsonResponse({ error: "VFD_WEBHOOK_SECRET not configured" }, 503);

  const fakeReq = new Request("https://internal/webhook", {
    method: "POST",
    headers: { "x-vfd-signature": secret, "content-type": "application/json" },
    body: JSON.stringify(entry.payload),
  });
  const res = await handleWebhook(fakeReq);
  const out = await res.json().catch(() => ({}));

  await supabaseAdmin.from("vfd_webhook_dlq").update({
    attempts: (Number(entry.attempts) || 1) + 1,
    last_attempt_at: new Date().toISOString(),
    resolved: out?.status === "processed" || out?.status === "duplicate_ignored",
    resolved_at: (out?.status === "processed" || out?.status === "duplicate_ignored") ? new Date().toISOString() : null,
  }).eq("id", dlqId);

  return jsonResponse({ data: out });
}

async function handleDlqResolve(userId: string, dlqId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some(r => ["admin", "super_admin"].includes(r.role as string));
  if (!isAdmin) return jsonResponse({ error: "Admin only" }, 403);
  await supabaseAdmin.from("vfd_webhook_dlq").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", dlqId);
  return jsonResponse({ data: { ok: true } });
}

async function handleReconciliationSweep(userId: string, body: Record<string, unknown>) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some(r => ["admin", "super_admin"].includes(r.role as string));
  if (!isAdmin) return jsonResponse({ error: "Admin only" }, 403);
  const result = await processStuckReservedTransactions({
    olderThanMinutes: Number(body.olderThanMinutes) || 5,
    limit: Number(body.limit) || 50,
  });
  return jsonResponse({ data: result });
}

// ─── PHASE 3: BALANCE DRIFT DETECTION ───
// For each user with recent VFD activity, compare VFD live balance vs the
// internal recorded balance and log a finding when |drift| > threshold.
async function runBalanceDriftSweep(opts: { sinceMinutes?: number; threshold?: number; limit?: number } = {}) {
  const supabaseAdmin = getSupabaseAdmin();
  const since = new Date(Date.now() - (opts.sinceMinutes ?? 60) * 60 * 1000).toISOString();
  const threshold = opts.threshold ?? 1;
  const limit = Math.min(opts.limit ?? 100, 500);

  // Pull distinct (user_id, account) pairs that had any activity in the window,
  // plus all active clients (so an idle account still gets periodic checks).
  const { data: recentTx } = await supabaseAdmin
    .from("vfd_sandbox_transactions")
    .select("user_id, vfd_account_number")
    .gte("created_at", since)
    .not("vfd_account_number", "is", null)
    .limit(limit);

  const seen = new Set<string>();
  const pairs: { userId: string; accountNo: string }[] = [];
  for (const r of recentTx ?? []) {
    const key = `${r.user_id}|${r.vfd_account_number}`;
    if (!seen.has(key) && r.user_id && r.vfd_account_number) {
      seen.add(key);
      pairs.push({ userId: r.user_id as string, accountNo: r.vfd_account_number as string });
    }
  }

  let checked = 0, healthy = 0, drifted = 0;
  const findings: Array<Record<string, unknown>> = [];

  for (const { userId, accountNo } of pairs) {
    try {
      const { data: balData } = await vfdRequest("/account/enquiry", "GET", undefined, { accountNumber: accountNo });
      const liveBalance = extractVfdBalance(balData);
      const recordedBalance = await getRecordedSandboxBalance(supabaseAdmin, userId);
      const drift = Number((liveBalance - recordedBalance).toFixed(2));
      const isHealthy = Math.abs(drift) <= threshold;

      const { data: inserted } = await supabaseAdmin
        .from("vfd_balance_drift_findings")
        .insert({
          user_id: userId,
          vfd_account_number: accountNo,
          vfd_live_balance: liveBalance,
          recorded_balance: recordedBalance,
          drift,
          threshold,
          is_healthy: isHealthy,
          details: { sinceMinutes: opts.sinceMinutes ?? 60 },
        })
        .select("id")
        .maybeSingle();

      checked++;
      if (isHealthy) healthy++; else drifted++;
      findings.push({ id: inserted?.id, userId, accountNo, drift, isHealthy });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Drift] check failed:", accountNo, msg);
    }
  }

  return { checked, healthy, drifted, threshold, findings };
}

async function handleDriftSweep(userId: string, body: Record<string, unknown>) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some(r => ["admin", "super_admin"].includes(r.role as string));
  if (!isAdmin) return jsonResponse({ error: "Admin only" }, 403);
  const result = await runBalanceDriftSweep({
    sinceMinutes: Number(body.sinceMinutes) || 60,
    threshold: Number(body.threshold) || 1,
    limit: Number(body.limit) || 100,
  });
  return jsonResponse({ data: result });
}

async function handleDriftFindings(userId: string, body: Record<string, unknown>) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some(r => ["admin", "super_admin"].includes(r.role as string));
  if (!isAdmin) return jsonResponse({ error: "Admin only" }, 403);
  const limit = Math.min(Number(body.limit) || 50, 200);
  let q = supabaseAdmin.from("vfd_balance_drift_findings").select("*").order("checked_at", { ascending: false }).limit(limit);
  if (body.onlyUnhealthy) q = q.eq("is_healthy", false);
  const { data, error } = await q;
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

async function handleTxEvents(userId: string, body: Record<string, unknown>) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some(r => ["admin", "super_admin"].includes(r.role as string));
  const reference = body.reference as string | undefined;
  const txId = body.transaction_id as string | undefined;
  if (!reference && !txId) return jsonResponse({ error: "reference or transaction_id required" }, 400);

  let q = supabaseAdmin.from("vfd_transaction_events").select("*").order("created_at", { ascending: true }).limit(200);
  if (reference) q = q.eq("reference", reference);
  if (txId) q = q.eq("transaction_id", txId);
  if (!isAdmin) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}




// ─── MAIN HANDLER ───────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const actionFromPath = pathSegments[pathSegments.length - 1];

    // Support webhook without auth
    if (actionFromPath === "webhook" && req.method === "POST") {
      return await handleWebhook(req);
    }

    // Cron-callable reconciliation sweep (no JWT; shared-secret auth)
    if (actionFromPath === "reconcile" && req.method === "POST") {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: tokenRow } = await supabaseAdmin
        .from("vfd_settings")
        .select("value")
        .eq("key", "reconcile_token")
        .maybeSingle();
      const expected =
        (tokenRow?.value as string | undefined) ||
        Deno.env.get("VFD_RECONCILE_TOKEN") ||
        Deno.env.get("VFD_WEBHOOK_SECRET");
      const provided =
        req.headers.get("x-vfd-reconcile-token") ||
        req.headers.get("x-vfd-signature") ||
        req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!expected || provided !== expected) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      const body = await req.json().catch(() => ({}));
      const result = await processStuckReservedTransactions({
        olderThanMinutes: Number(body.olderThanMinutes) || 5,
        limit: Number(body.limit) || 50,
      });
      return jsonResponse({ data: result });
    }

    // Cron-callable drift sweep (same shared-secret auth)
    if (actionFromPath === "drift-sweep" && req.method === "POST") {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: tokenRow } = await supabaseAdmin
        .from("vfd_settings").select("value").eq("key", "reconcile_token").maybeSingle();
      const expected =
        (tokenRow?.value as string | undefined) ||
        Deno.env.get("VFD_RECONCILE_TOKEN") ||
        Deno.env.get("VFD_WEBHOOK_SECRET");
      const provided =
        req.headers.get("x-vfd-reconcile-token") ||
        req.headers.get("x-vfd-signature") ||
        req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!expected || provided !== expected) return jsonResponse({ error: "Unauthorized" }, 401);
      const body = await req.json().catch(() => ({}));
      const result = await runBalanceDriftSweep({
        sinceMinutes: Number(body.sinceMinutes) || 60,
        threshold: Number(body.threshold) || 1,
        limit: Number(body.limit) || 100,
      });
      return jsonResponse({ data: result });
    }

    // All other actions require auth
    const user = await getUserFromRequest(req);
    const userId = user.id;

    // Parse body for POST requests
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json();
    }

    const action = body.action || actionFromPath;

    switch (action) {
      case "bvn_lookup":
        return await handleBvnLookup(userId, body.bvn as string);

      case "create_tiered":
        return await handleCreateTiered(userId, body);

      case "create_no_consent":
        return await handleCreateNoConsent(userId, body.bvn as string, body.dateOfBirth as string);

      case "create_consent":
        return await handleCreateConsent(userId, body);

      case "bvn_consent":
        return await handleBvnConsent(body.bvn as string, body.reference as string | undefined);

      case "client_release":
        return await handleClientRelease(userId, body.accountNo as string);

      case "tier_upgrade":
        return await handleTierUpgrade(userId, body);

      case "balance_enquiry":
        return await handleBalanceEnquiry(userId, body.accountNo as string);

      case "transaction_history":
        return await handleTransactionHistory(
          userId,
          body.accountNo as string,
          body.transactionType as string || "wallet",
          body.startDate as string | undefined,
          body.endDate as string | undefined,
          body.page as string || "0",
          body.size as string || "20"
        );

      case "bank_list":
        return await handleBankList();

      case "validate_beneficiary":
        return await handleValidateBeneficiary(
          body.accountNo as string,
          body.bankCode as string,
          body.transferType as string || "inter"
        );

      case "transfer":
        return await handleTransfer(userId, body);

      case "quote_transfer":
        return await handleQuoteTransfer(userId, body);

      case "sandbox_credit":
        return await handleSandboxCredit(userId, body.accountNo as string, body.amount as number);

      case "create_virtual_account":
        return await handleCreateVirtualAccount(userId, body);

      case "transaction_status":
        return await handleTransactionStatusQuery(body.reference as string, body.sessionId as string);

      case "sub_accounts":
        return await handleSubAccounts(body.entity as string, body.page as string, body.size as string);

      case "get_client":
        return await handleGetClient(userId);

      case "get_transactions":
        return await handleGetTransactions(userId);

      // Lock Funds actions
      case "get_lock_configs":
        return await handleGetLockConfigs();

      case "get_user_balance":
        return await handleGetUserBalance(userId);

      case "sync_balance":
        return await handleSyncBalance(userId);

      case "create_lock":
        return await handleCreateLock(userId, body);

      case "get_locked_funds":
        return await handleGetLockedFunds(userId);

      case "unlock_funds":
        return await handleUnlockFunds(userId, body.lock_id as string);

      case "break_lock":
        return await handleBreakLock(userId, body.lock_id as string);

      case "get_lock_ledger":
        return await handleGetLockLedger(userId);

      // Admin: DLQ + reconciliation
      case "dlq_list":
        return await handleDlqList(userId, Number(body.limit) || 50);
      case "dlq_replay":
        return await handleDlqReplay(userId, body.id as string);
      case "dlq_resolve":
        return await handleDlqResolve(userId, body.id as string);
      case "reconciliation_sweep":
        return await handleReconciliationSweep(userId, body);
      case "drift_sweep":
        return await handleDriftSweep(userId, body);
      case "drift_findings":
        return await handleDriftFindings(userId, body);
      case "tx_events":
        return await handleTxEvents(userId, body);

      case "list_transfer_beneficiaries":
        return await handleListTransferBeneficiaries(userId);
      case "save_transfer_beneficiary":
        return await handleSaveTransferBeneficiary(userId, body);
      case "delete_transfer_beneficiary":
        return await handleDeleteTransferBeneficiary(userId, body);
      case "pin_transfer_beneficiary":
        return await handlePinTransferBeneficiary(userId, body);


      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[VFD Banking Error]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});

// =============================================
// TRANSFER BENEFICIARIES
// =============================================

async function handleListTransferBeneficiaries(userId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_transfer_beneficiaries")
    .select("*")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false });
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: data || [] });
}

async function handlePinTransferBeneficiary(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const id = String(body.id || "");
  const pinned = Boolean(body.pinned);
  if (!id) return jsonResponse({ error: "id required" }, 400);
  const { data, error } = await db
    .from("vfd_sandbox_transfer_beneficiaries")
    .update({ pinned })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

async function handleSaveTransferBeneficiary(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const alias = String(body.alias || "").trim();
  const accountNumber = String(body.account_number || "").trim();
  const bankCode = String(body.bank_code || "").trim();
  const bankName = String(body.bank_name || "").trim();
  const beneficiaryName = String(body.beneficiary_name || "").trim();
  const isIntra = bankCode === "999999";
  if (!accountNumber || !bankCode || !bankName || !beneficiaryName) {
    return jsonResponse({ error: "account_number, bank_code, bank_name and beneficiary_name are required." }, 400);
  }
  if (!/^\d{10}$/.test(accountNumber)) {
    return jsonResponse({ error: "Account number must be 10 digits." }, 400);
  }
  const { data, error } = await db
    .from("vfd_sandbox_transfer_beneficiaries")
    .upsert({
      user_id: userId,
      alias: alias || beneficiaryName,
      account_number: accountNumber,
      bank_code: bankCode,
      bank_name: bankName,
      beneficiary_name: beneficiaryName,
      is_intra: isIntra,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "user_id,bank_code,account_number" })
    .select()
    .single();
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

async function handleDeleteTransferBeneficiary(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const id = String(body.id || "");
  if (!id) return jsonResponse({ error: "id required" }, 400);
  const { error } = await db
    .from("vfd_sandbox_transfer_beneficiaries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: { deleted: true } });
}
