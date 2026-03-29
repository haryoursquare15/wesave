import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const BASE = `${SUPABASE_URL}/functions/v1/vfd-banking`;

// We need a valid JWT. Sign in with test credentials.
async function getTestToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: "loloaborisade@gmail.com",
      password: "wesave2025",
    }),
  });
  const data = await res.json();
  await res.text().catch(() => {});
  if (!data.access_token) throw new Error("Auth failed: " + JSON.stringify(data));
  return data.access_token;
}

async function vfdCall(token: string, body: Record<string, unknown>) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

Deno.test("VFD No-Consent Full Flow", async (t) => {
  const token = await getTestToken();

  // 1. BVN Lookup
  await t.step("BVN Lookup", async () => {
    const result = await vfdCall(token, { action: "bvn_lookup", bvn: "22155258549" });
    assertEquals(result.status, 200);
    console.log("BVN Lookup:", JSON.stringify(result.data, null, 2));
  });

  // 2. Create No Consent Account
  let accountNo = "";
  let clientId = "";
  await t.step("Create No Consent Account", async () => {
    const result = await vfdCall(token, {
      action: "create_no_consent",
      bvn: "22155258549",
      dateOfBirth: "05-Apr-1994",
    });
    assertEquals(result.status, 200);
    console.log("Create No Consent:", JSON.stringify(result.data, null, 2));
    // Extract account number
    const d = result.data?.data?.data || result.data?.data;
    if (d?.accountNo) accountNo = d.accountNo;
    if (d?.clientId) clientId = d.clientId;
    console.log("Account No:", accountNo, "Client ID:", clientId);
  });

  // 3. Bank List
  await t.step("Bank List", async () => {
    const result = await vfdCall(token, { action: "bank_list" });
    assertEquals(result.status, 200);
    const banks = result.data?.data?.data || result.data?.data;
    console.log("Bank List count:", Array.isArray(banks) ? banks.length : "not array");
  });

  // 4. Get Client (from DB)
  await t.step("Get Client from DB", async () => {
    const result = await vfdCall(token, { action: "get_client" });
    assertEquals(result.status, 200);
    console.log("DB Client:", JSON.stringify(result.data, null, 2));
    // Use DB account number if not set
    if (!accountNo && result.data?.data?.vfd_account_number) {
      accountNo = result.data.data.vfd_account_number;
    }
    if (!clientId && result.data?.data?.vfd_client_id) {
      clientId = result.data.data.vfd_client_id;
    }
    console.log("Using Account No:", accountNo);
  });

  // 5. Sandbox Credit (fund the account)
  if (accountNo) {
    await t.step("Sandbox Credit", async () => {
      const result = await vfdCall(token, {
        action: "sandbox_credit",
        accountNo,
        amount: 5000,
      });
      assertEquals(result.status, 200);
      console.log("Sandbox Credit:", JSON.stringify(result.data, null, 2));
    });

    // 6. Balance Enquiry
    await t.step("Balance Enquiry", async () => {
      const result = await vfdCall(token, { action: "balance_enquiry", accountNo });
      assertEquals(result.status, 200);
      console.log("Balance:", JSON.stringify(result.data, null, 2));
    });

    // 7. Validate Beneficiary
    await t.step("Validate Beneficiary", async () => {
      const result = await vfdCall(token, {
        action: "validate_beneficiary",
        accountNo: "0123456789",
        bankCode: "044",
      });
      assertEquals(result.status, 200);
      console.log("Validate Beneficiary:", JSON.stringify(result.data, null, 2));
    });

    // 8. Transfer (small amount)
    await t.step("Transfer", async () => {
      const result = await vfdCall(token, {
        action: "transfer",
        fromAccount: accountNo,
        toAccount: "0123456789",
        bankCode: "044",
        amount: 100,
        narration: "Test transfer",
        beneficiaryName: "Test User",
      });
      assertEquals(result.status, 200);
      console.log("Transfer:", JSON.stringify(result.data, null, 2));
    });

    // 9. Transaction History
    await t.step("Transaction History", async () => {
      const result = await vfdCall(token, {
        action: "transaction_history",
        accountNo,
      });
      assertEquals(result.status, 200);
      console.log("Transaction History:", JSON.stringify(result.data, null, 2));
    });

    // 10. Get Transactions from DB
    await t.step("Get Transactions from DB", async () => {
      const result = await vfdCall(token, { action: "get_transactions" });
      assertEquals(result.status, 200);
      console.log("DB Transactions:", JSON.stringify(result.data, null, 2));
    });
  }

  // 11. Tier Upgrade
  if (clientId) {
    await t.step("Tier Upgrade", async () => {
      const result = await vfdCall(token, {
        action: "tier_upgrade",
        bvn: "22155258549",
        clientId,
      });
      assertEquals(result.status, 200);
      console.log("Tier Upgrade:", JSON.stringify(result.data, null, 2));
    });
  }
});
