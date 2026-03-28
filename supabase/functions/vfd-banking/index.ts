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

function getAccessToken(): string {
  const token = Deno.env.get("VFD_ACCESS_TOKEN");
  if (!token) throw new Error("VFD_ACCESS_TOKEN not configured");
  return token;
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
    global: {
      headers: { Authorization: authHeader },
    },
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
  const accessToken = getAccessToken();
  const url = new URL(`${VFD_BASE_URL}${endpoint}`);
  url.searchParams.set("access-token", accessToken);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
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
  return { data, status: response.status };
}

// ─── ACTION HANDLERS ────────────────────────────────────────────

// BVN Lookup
async function handleBvnLookup(bvn: string) {
  if (!/^\d{11}$/.test(bvn)) {
    return new Response(
      JSON.stringify({ error: "BVN must be exactly 11 digits" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data, status } = await vfdRequest("/client", "GET", undefined, { bvn });

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Create Account - No Consent Flow
async function handleCreateNoConsent(
  userId: string,
  bvn: string,
  dateOfBirth: string
) {
  if (!/^\d{11}$/.test(bvn)) {
    return new Response(
      JSON.stringify({ error: "BVN must be exactly 11 digits" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!/^\d{2}-\d{2}-\d{4}$/.test(dateOfBirth)) {
    return new Response(
      JSON.stringify({ error: "Date of birth must be in DD-MM-YYYY format" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data, status } = await vfdRequest(
    "/client/create",
    "POST",
    undefined,
    { bvn, dateOfBirth }
  );

  const supabaseAdmin = getSupabaseAdmin();
  const vfdData = data as Record<string, unknown>;

  // Store client info
  await supabaseAdmin.from("vfd_sandbox_clients").upsert({
    user_id: userId,
    bvn,
    date_of_birth: dateOfBirth,
    vfd_client_id: vfdData?.data
      ? (vfdData.data as Record<string, unknown>)?.clientId?.toString()
      : null,
    vfd_account_number: vfdData?.data
      ? (vfdData.data as Record<string, unknown>)?.accountNo?.toString()
      : null,
    full_name: vfdData?.data
      ? (vfdData.data as Record<string, unknown>)?.fullname?.toString()
      : null,
    phone: vfdData?.data
      ? (vfdData.data as Record<string, unknown>)?.phone?.toString()
      : null,
    gender: vfdData?.data
      ? (vfdData.data as Record<string, unknown>)?.gender?.toString()
      : null,
    kyc_method: "no_consent",
    consent_status: "not_required",
    account_status: status === 200 ? "active" : "failed",
    metadata: vfdData,
    source: "vfd_sandbox",
  }, { onConflict: "user_id" });

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Create Account - Consent Flow (iGree)
async function handleCreateConsent(
  userId: string,
  body: Record<string, unknown>
) {
  // Step 1: Create individual client
  const { data: clientData, status: clientStatus } = await vfdRequest(
    "/client/individual",
    "POST",
    body
  );

  if (clientStatus !== 200) {
    return new Response(
      JSON.stringify({ data: clientData, vfd_status: clientStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const vfdData = clientData as Record<string, unknown>;
  const supabaseAdmin = getSupabaseAdmin();

  // Store client with pending consent
  await supabaseAdmin.from("vfd_sandbox_clients").upsert({
    user_id: userId,
    bvn: body.bvn as string,
    date_of_birth: body.dateOfBirth as string,
    full_name: `${body.firstname} ${body.lastname}`,
    phone: body.phone as string,
    gender: body.gender as string,
    vfd_client_id: vfdData?.data
      ? (vfdData.data as Record<string, unknown>)?.clientId?.toString()
      : null,
    kyc_method: "consent",
    consent_status: "pending",
    account_status: "pending_consent",
    metadata: vfdData,
    source: "vfd_sandbox",
  }, { onConflict: "user_id" });

  return new Response(JSON.stringify({ data: clientData, vfd_status: clientStatus }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Trigger BVN Consent OTP
async function handleBvnConsent(clientId: string) {
  const { data, status } = await vfdRequest("/bvn-consent", "POST", { clientId });

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Release Client (after consent confirmed)
async function handleClientRelease(userId: string, clientId: string) {
  const { data, status } = await vfdRequest("/client/release", "POST", { clientId });

  const supabaseAdmin = getSupabaseAdmin();
  const vfdData = data as Record<string, unknown>;

  if (status === 200) {
    await supabaseAdmin
      .from("vfd_sandbox_clients")
      .update({
        consent_status: "confirmed",
        account_status: "active",
        vfd_account_number: vfdData?.data
          ? (vfdData.data as Record<string, unknown>)?.accountNo?.toString()
          : null,
        metadata: vfdData,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Tier Upgrade
async function handleTierUpgrade(userId: string, bvn: string, clientId: string) {
  const { data, status } = await vfdRequest("/client/update", "POST", {
    clientId,
    bvn,
  });

  if (status === 200) {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from("vfd_sandbox_clients")
      .update({ tier: "tier2", bvn, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Balance Enquiry
async function handleBalanceEnquiry(accountNo: string) {
  const { data, status } = await vfdRequest("/account/enquiry", "GET", undefined, {
    accountNo,
  });

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Transaction History
async function handleTransactionHistory(accountNo: string, startDate?: string, endDate?: string) {
  const params: Record<string, string> = { accountNo };
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const { data, status } = await vfdRequest("/account/transactions", "GET", undefined, params);

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Get Bank List
async function handleBankList() {
  const { data, status } = await vfdRequest("/bank", "GET");

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Validate Beneficiary
async function handleValidateBeneficiary(accountNo: string, bankCode: string) {
  const { data, status } = await vfdRequest("/transfer/recipient", "POST", {
    accountNo,
    bankCode,
  });

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Initiate Transfer
async function handleTransfer(
  userId: string,
  fromAccount: string,
  toAccount: string,
  bankCode: string,
  amount: number,
  narration: string,
  beneficiaryName: string
) {
  const reference = `vfd-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const { data, status } = await vfdRequest("/transfer", "POST", {
    fromAccount,
    toAccount,
    transactionAmount: amount,
    bankCode,
    narration,
    reference,
  });

  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.from("vfd_sandbox_transactions").insert({
    user_id: userId,
    vfd_account_number: fromAccount,
    amount,
    transaction_type: "transfer",
    status: status === 200 ? "completed" : "failed",
    reference,
    vfd_reference: (data as Record<string, unknown>)?.reference?.toString(),
    beneficiary_account: toAccount,
    beneficiary_bank_code: bankCode,
    beneficiary_name: beneficiaryName,
    description: narration,
    metadata: data as Record<string, unknown>,
    source: "vfd_sandbox",
  });

  return new Response(JSON.stringify({ data, vfd_status: status, reference }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Sandbox Credit (fund test account)
async function handleSandboxCredit(
  userId: string,
  accountNo: string,
  amount: number
) {
  const reference = `credit-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const { data, status } = await vfdRequest("/credit", "POST", {
    accountNo,
    transactionAmount: amount,
    narration: "Sandbox test credit",
    reference,
  });

  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.from("vfd_sandbox_transactions").insert({
    user_id: userId,
    vfd_account_number: accountNo,
    amount,
    transaction_type: "credit",
    status: status === 200 ? "completed" : "failed",
    reference,
    description: "Sandbox test credit",
    metadata: data as Record<string, unknown>,
    source: "vfd_sandbox",
  });

  return new Response(JSON.stringify({ data, vfd_status: status, reference }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Virtual Account Creation
async function handleCreateVirtualAccount(
  userId: string,
  body: Record<string, unknown>
) {
  const { data, status } = await vfdRequest("/virtualaccount", "POST", body);

  return new Response(JSON.stringify({ data, vfd_status: status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  return new Response(JSON.stringify({ status: "received" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── MAIN HANDLER ───────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    // Path: /vfd-banking/{action}
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
        return await handleBvnConsent(body.clientId as string);

      case "client_release":
        return await handleClientRelease(userId, body.clientId as string);

      case "tier_upgrade":
        return await handleTierUpgrade(userId, body.bvn as string, body.clientId as string);

      case "balance_enquiry":
        return await handleBalanceEnquiry(body.accountNo as string);

      case "transaction_history":
        return await handleTransactionHistory(
          body.accountNo as string,
          body.startDate as string | undefined,
          body.endDate as string | undefined
        );

      case "bank_list":
        return await handleBankList();

      case "validate_beneficiary":
        return await handleValidateBeneficiary(
          body.accountNo as string,
          body.bankCode as string
        );

      case "transfer":
        return await handleTransfer(
          userId,
          body.fromAccount as string,
          body.toAccount as string,
          body.bankCode as string,
          body.amount as number,
          body.narration as string,
          body.beneficiaryName as string
        );

      case "sandbox_credit":
        return await handleSandboxCredit(userId, body.accountNo as string, body.amount as number);

      case "create_virtual_account":
        return await handleCreateVirtualAccount(userId, body);

      case "get_client":
        return await handleGetClient(userId);

      case "get_transactions":
        return await handleGetTransactions(userId);

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (err) {
    console.error("[VFD Banking Error]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
