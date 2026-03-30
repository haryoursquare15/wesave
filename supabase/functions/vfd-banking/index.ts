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

// ─── ACTION HANDLERS ────────────────────────────────────────────

// BVN Lookup
async function handleBvnLookup(bvn: string) {
  if (!/^\d{11}$/.test(bvn)) {
    return jsonResponse({ error: "BVN must be exactly 11 digits" }, 400);
  }

  const { data, status } = await vfdRequest("/client", "GET", undefined, { bvn });
  return jsonResponse({ data, vfd_status: status });
}

// Create Account - No Consent Flow
async function handleCreateNoConsent(userId: string, bvn: string, dateOfBirth: string) {
  if (!/^\d{11}$/.test(bvn)) {
    return jsonResponse({ error: "BVN must be exactly 11 digits" }, 400);
  }
  if (!/^\d{2}-(\d{2}|[A-Za-z]{3})-\d{4}$/.test(dateOfBirth)) {
    return jsonResponse({ error: "Date of birth must be in DD-MM-YYYY or DD-MMM-YYYY format (e.g. 08-Mar-1995)" }, 400);
  }

  const { data, status } = await vfdRequest("/client/create", "POST", undefined, { bvn, dateOfBirth });

  const supabaseAdmin = getSupabaseAdmin();
  const vfdData = data as Record<string, unknown>;

  // Store client info on success or "Client Account Exists" (status 929 with accountNo)
  const isSuccess = status === 200 && (!vfdData?.status || vfdData.status === 200 || vfdData.status === "00");
  const isExisting = vfdData?.status === "929" || vfdData?.status === "01";

  if (isSuccess || isExisting) {
    const innerData = (vfdData?.data || {}) as Record<string, unknown>;
    await supabaseAdmin.from("vfd_sandbox_clients").upsert({
      user_id: userId,
      bvn,
      date_of_birth: dateOfBirth,
      vfd_client_id: innerData?.clientId?.toString() || null,
      vfd_account_number: innerData?.accountNo?.toString() || null,
      full_name: innerData?.fullname?.toString() || innerData?.firstname ? `${innerData?.firstname || ""} ${innerData?.lastname || ""}`.trim() : null,
      phone: innerData?.phone?.toString() || null,
      gender: innerData?.gender?.toString() || null,
      kyc_method: "no_consent",
      consent_status: "not_required",
      account_status: "active",
      metadata: vfdData,
      source: "vfd_sandbox",
    }, { onConflict: "user_id" });
  }

  return jsonResponse({ data, vfd_status: status });
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

// Trigger BVN Consent - GET with query params per VFD docs
async function handleBvnConsent(bvn: string, reference?: string) {
  const params: Record<string, string> = { bvn, type: "02" };
  if (reference) params.reference = reference;

  const { data, status } = await vfdRequest("/bvn-consent", "GET", undefined, params);
  return jsonResponse({ data, vfd_status: status });
}

// Release Client (after consent confirmed) - uses accountNo per VFD docs
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

// Tier Upgrade - uses accountNo per VFD docs
async function handleTierUpgrade(userId: string, body: Record<string, unknown>) {
  // VFD /client/update requires accountNo and bvn
  const supabaseAdmin = getSupabaseAdmin();

  // Fetch client details to get accountNo if not provided
  let accountNo = body.accountNo as string;
  let bvn = body.bvn as string;

  if (!accountNo || !bvn) {
    const { data: clientData } = await supabaseAdmin
      .from("vfd_sandbox_clients")
      .select("vfd_account_number, bvn")
      .eq("user_id", userId)
      .maybeSingle();

    if (clientData) {
      accountNo = accountNo || clientData.vfd_account_number || "";
      bvn = bvn || clientData.bvn || "";
    }
  }

  if (!accountNo || !bvn) {
    return jsonResponse({ error: "Account number and BVN are required for tier upgrade" }, 400);
  }

  console.log("[VFD tier_upgrade] accountNo:", accountNo, "bvn:", bvn);

  const { data, status } = await vfdRequest("/client/update", "POST", { accountNo, bvn });
  console.log("[VFD tier_upgrade] Response:", JSON.stringify(data));

  const vfdData = data as Record<string, unknown>;
  if (status === 200 && (vfdData?.status === "00" || vfdData?.status === 200)) {
    const innerData = (vfdData?.data || {}) as Record<string, unknown>;
    await supabaseAdmin
      .from("vfd_sandbox_clients")
      .update({
        tier: innerData?.currentTier?.toString() || "tier2",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return jsonResponse({ data, vfd_status: status });
}

// Balance Enquiry - VFD uses accountNumber (not accountNo)
async function handleBalanceEnquiry(accountNo: string) {
  const { data, status } = await vfdRequest("/account/enquiry", "GET", undefined, {
    accountNumber: accountNo,
  });
  return jsonResponse({ data, vfd_status: status });
}

// Transaction History - VFD requires transactionType, startDate, endDate
async function handleTransactionHistory(
  accountNo: string,
  transactionType: string = "wallet",
  startDate?: string,
  endDate?: string,
  page: string = "0",
  size: string = "20"
) {
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
  const { data, status } = await vfdRequest("/transfer/recipient", "GET", undefined, {
    accountNo,
    bank: bankCode,
    transfer_type: transferType,
  });
  console.log("[VFD validate_beneficiary] Raw response:", JSON.stringify(data));

  // Normalize: extract account name from various possible response shapes
  const vfdData = data as Record<string, unknown>;
  const innerData = vfdData?.data as Record<string, unknown> | undefined;
  const accountName = innerData?.accountName || innerData?.account_name || innerData?.beneficiaryName || innerData?.name || null;

  return jsonResponse({ data, accountName, vfd_status: status });
}

// Initiate Transfer - Full VFD transfer payload
async function handleTransfer(
  userId: string,
  body: Record<string, unknown>
) {
  const fromAccount = body.fromAccount as string;
  const toAccount = body.toAccount as string;

  if (!fromAccount || !toAccount) {
    return jsonResponse({ error: "fromAccount and toAccount are required" }, 400);
  }

  // Step 1: Get sender account details via enquiry
  const { data: senderEnquiry, status: senderStatus } = await vfdRequest("/account/enquiry", "GET", undefined, {
    accountNumber: fromAccount,
  });

  if (senderStatus !== 200 || (senderEnquiry as Record<string, unknown>)?.status !== "00") {
    return jsonResponse({ error: "Could not retrieve sender account details", data: senderEnquiry }, 400);
  }

  const senderData = (senderEnquiry as Record<string, unknown>)?.data as Record<string, unknown>;

  // Step 2: Generate signature
  const signature = await generateTransferSignature(fromAccount, toAccount);

  // Step 3: Build VFD transfer payload
  const walletPrefix = Deno.env.get("VFD_WALLET_NAME") || "WeSave";
  const reference = body.reference as string || `${walletPrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const transferType = body.transferType as string || body.bankCode === "999999" ? "intra" : "inter";

  const transferPayload: Record<string, unknown> = {
    fromAccount,
    fromClientId: senderData?.clientId?.toString() || "",
    fromClient: senderData?.client?.toString() || "",
    fromSavingsId: senderData?.accountId?.toString() || "",
    fromBvn: senderData?.bvn?.toString() || "",
    toAccount,
    toBank: body.bankCode as string || "",
    toClient: body.beneficiaryName as string || body.toClient as string || "",
    toClientId: body.toClientId as string || "",
    toSavingsId: body.toSavingsId as string || "",
    toSession: body.toSession as string || "",
    toBvn: body.toBvn as string || "",
    signature,
    amount: String(body.amount),
    remark: body.narration as string || body.remark as string || "Transfer",
    transferType,
    reference,
  };

  // Add uniqueSenderAccountId if provided (for pool implementation)
  if (body.uniqueSenderAccountId) {
    transferPayload.uniqueSenderAccountId = body.uniqueSenderAccountId;
  }

  console.log("[VFD Transfer] Payload:", JSON.stringify(transferPayload));

  const { data, status } = await vfdRequest("/transfer", "POST", transferPayload);

  const supabaseAdmin = getSupabaseAdmin();
  const vfdData = data as Record<string, unknown>;
  const isSuccess = vfdData?.status === "00";

  await supabaseAdmin.from("vfd_sandbox_transactions").insert({
    user_id: userId,
    vfd_account_number: fromAccount,
    amount: Number(body.amount),
    transaction_type: "transfer",
    status: isSuccess ? "completed" : "failed",
    reference,
    vfd_reference: vfdData?.data ? (vfdData.data as Record<string, unknown>)?.txnId?.toString() : null,
    beneficiary_account: toAccount,
    beneficiary_bank_code: body.bankCode as string,
    beneficiary_name: body.beneficiaryName as string || body.toClient as string,
    description: body.narration as string || body.remark as string || "Transfer",
    metadata: data as Record<string, unknown>,
    source: "vfd_sandbox",
  });

  return jsonResponse({ data, vfd_status: status, reference });
}

// Sandbox Credit - per VFD docs requires senderAccountNo and senderBank
async function handleSandboxCredit(userId: string, accountNo: string, amount: number) {
  const reference = `WeSave-credit-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const { data, status } = await vfdRequest("/credit", "POST", {
    amount: String(amount),
    accountNo,
    senderAccountNo: "5050104070",
    senderBank: "000002",
    senderNarration: `Sandbox test credit - ${reference}`,
  });

  const supabaseAdmin = getSupabaseAdmin();
  const vfdData = data as Record<string, unknown>;
  const isSuccess = vfdData?.status === "00";

  await supabaseAdmin.from("vfd_sandbox_transactions").insert({
    user_id: userId,
    vfd_account_number: accountNo,
    amount,
    transaction_type: "credit",
    status: isSuccess ? "completed" : "failed",
    reference,
    description: "Sandbox test credit",
    metadata: data as Record<string, unknown>,
    source: "vfd_sandbox",
  });

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

// Webhook handler (no auth required)
async function handleWebhook(req: Request) {
  const payload = await req.json();
  const supabaseAdmin = getSupabaseAdmin();

  await supabaseAdmin.from("vfd_sandbox_webhook_logs").insert({
    event_type: payload?.event || payload?.type || "unknown",
    payload,
    processed: false,
  });

  console.log("[VFD Webhook]", JSON.stringify(payload));
  return jsonResponse({ status: "received" });
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

// Get user balance (internal ledger)
async function handleGetUserBalance(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("vfd_user_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
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

  // Get VFD balance
  const { data: balData } = await vfdRequest("/account/enquiry", "GET", undefined, {
    accountNumber: client.vfd_account_number,
  });

  const vfdBalance = Number(
    ((balData as Record<string, unknown>)?.data as Record<string, unknown>)?.availableBalance || 0
  );

  // Upsert internal balance
  const { data: existing } = await supabaseAdmin
    .from("vfd_user_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("vfd_user_balances")
      .update({
        total_balance: vfdBalance,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } else {
    await supabaseAdmin.from("vfd_user_balances").insert({
      user_id: userId,
      total_balance: vfdBalance,
      locked_balance: 0,
      savings_balance: 0,
      last_synced_at: new Date().toISOString(),
    });
  }

  // Re-fetch
  const { data: updated } = await supabaseAdmin
    .from("vfd_user_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return jsonResponse({ data: updated, vfd_balance: vfdBalance });
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

  // Get user balance
  const { data: balance } = await supabaseAdmin
    .from("vfd_user_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!balance) return jsonResponse({ error: "No balance record. Please sync your balance first." }, 400);

  const availableBalance = Number(balance.total_balance) - Number(balance.locked_balance) - Number(balance.savings_balance);
  if (amount > availableBalance) {
    return jsonResponse({ error: `Insufficient available balance. Available: ${availableBalance}` }, 400);
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
  await supabaseAdmin.from("vfd_lock_ledger").insert({
    user_id: userId,
    lock_id: lock.id,
    entry_type: "lock_created",
    amount,
    balance_before: availableBalance,
    balance_after: availableBalance - amount,
    locked_before: Number(balance.locked_balance),
    locked_after: newLocked,
    description: `Locked ₦${amount.toLocaleString()} for ${durationMonths} months at ${interestRate}%`,
  });

  return jsonResponse({ data: lock });
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
  await supabaseAdmin.from("vfd_lock_ledger").insert({
    user_id: userId,
    lock_id: lockId,
    entry_type: "lock_matured",
    amount: creditAmount,
    balance_before: availBefore,
    balance_after: availBefore + creditAmount,
    locked_before: Number(balance.locked_balance),
    locked_after: Math.max(0, newLocked),
    description: `Matured: ₦${Number(lock.principal_amount).toLocaleString()} + ₦${Number(lock.expected_interest).toLocaleString()} interest`,
  });

  return jsonResponse({ data: { unlocked: creditAmount, interest_earned: Number(lock.expected_interest) } });
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
  await supabaseAdmin.from("vfd_lock_ledger").insert({
    user_id: userId,
    lock_id: lockId,
    entry_type: "lock_broken",
    amount: creditAmount,
    balance_before: availBefore,
    balance_after: availBefore + creditAmount,
    locked_before: Number(balance.locked_balance),
    locked_after: Math.max(0, newLocked),
    description: `Early withdrawal: ₦${Number(lock.principal_amount).toLocaleString()} principal, penalty: ₦${penaltyAmount.toLocaleString()}`,
  });

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
        return await handleBvnLookup(body.bvn as string);

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
        return await handleBalanceEnquiry(body.accountNo as string);

      case "transaction_history":
        return await handleTransactionHistory(
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

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[VFD Banking Error]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
