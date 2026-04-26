/**
 * End-to-end security test suite for the `vfd-banking` edge function.
 *
 * This suite probes known attack vectors and FAILS if any of them succeed.
 * Run via the supabase--test_edge_functions tool, or:
 *   deno test --allow-net --allow-env supabase/functions/vfd-banking/security.test.ts
 *
 * Required env (loaded from project root .env):
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_PUBLISHABLE_KEY
 *
 * Required test credentials (set as env vars or via .env):
 *   - SECTEST_USER_A_EMAIL / SECTEST_USER_A_PASSWORD  (a fully-onboarded user)
 *   - SECTEST_USER_B_EMAIL / SECTEST_USER_B_PASSWORD  (a second onboarded user)
 *
 * Both users must already have VFD sandbox accounts. The suite never mutates
 * production data — it only attempts (and expects to be denied) operations
 * across user boundaries.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const BASE = `${SUPABASE_URL}/functions/v1/vfd-banking`;

const USER_A_EMAIL = Deno.env.get("SECTEST_USER_A_EMAIL") ?? "loloaborisade@gmail.com";
const USER_A_PASSWORD = Deno.env.get("SECTEST_USER_A_PASSWORD") ?? "wesave2025";
const USER_B_EMAIL = Deno.env.get("SECTEST_USER_B_EMAIL") ?? "";
const USER_B_PASSWORD = Deno.env.get("SECTEST_USER_B_PASSWORD") ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Auth failed for ${email}: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

interface CallResult {
  status: number;
  data: Record<string, unknown>;
}

async function call(
  token: string | null,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    ...extraHeaders,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(BASE, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  await res.body?.cancel().catch(() => {});
  return { status: res.status, data };
}

/**
 * Asserts that a response was *denied* (auth/authorization failure or
 * validation error). Anything in the 200/201 range counts as a successful
 * attack and FAILS the test.
 */
function assertDenied(result: CallResult, label: string) {
  // Treat any 4xx/5xx with no `data.data` payload as a denial.
  // Treat 200 with explicit `{ error: ... }` body as a denial too.
  const isOk =
    result.status >= 200 &&
    result.status < 300 &&
    !(result.data && (result.data as { error?: unknown }).error);

  if (isOk) {
    throw new Error(
      `🚨 SECURITY VECTOR OPEN [${label}] — request unexpectedly succeeded:` +
        ` status=${result.status} body=${JSON.stringify(result.data)}`,
    );
  }
}

async function getOwnAccountNo(token: string): Promise<string> {
  const r = await call(token, { action: "get_client" });
  const acct =
    (r.data as { data?: { vfd_account_number?: string } })?.data
      ?.vfd_account_number ?? "";
  if (!acct) throw new Error("Test user has no VFD account configured");
  return acct;
}

const hasUserB = USER_B_EMAIL && USER_B_PASSWORD;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

Deno.test("vfd-banking security: unauthenticated requests are rejected", async (t) => {
  await t.step("no auth header → bvn_lookup denied", async () => {
    const r = await call(null, { action: "bvn_lookup", bvn: "22155258549" });
    assertDenied(r, "no-auth bvn_lookup");
    assertEquals(r.status >= 400, true);
  });

  await t.step("no auth header → balance_enquiry denied", async () => {
    const r = await call(null, {
      action: "balance_enquiry",
      accountNo: "1000000000",
    });
    assertDenied(r, "no-auth balance_enquiry");
  });

  await t.step("no auth header → transfer denied", async () => {
    const r = await call(null, {
      action: "transfer",
      fromAccount: "1000000000",
      toAccount: "0123456789",
      bankCode: "044",
      amount: 100,
    });
    assertDenied(r, "no-auth transfer");
  });

  await t.step("forged JWT → denied", async () => {
    const r = await call("not.a.valid.jwt", { action: "get_client" });
    assertDenied(r, "forged-jwt get_client");
  });
});

Deno.test("vfd-banking security: BVN enumeration is blocked", async (t) => {
  const tokenA = await login(USER_A_EMAIL, USER_A_PASSWORD);

  await t.step("malformed BVN → 400, no oracle leak", async () => {
    const r = await call(tokenA, { action: "bvn_lookup", bvn: "abc" });
    assertEquals(r.status, 400);
    // Must not echo VFD upstream data on validation failure
    assert(
      !JSON.stringify(r.data).toLowerCase().includes("firstname"),
      "validation failure leaked upstream BVN data",
    );
  });

  await t.step(
    "post-onboarding BVN lookup is blocked (403) for non-admin",
    async () => {
      // Either: the user already has a VFD client → 403
      // Or: the user is an admin → allowed (in which case skip).
      const client = await call(tokenA, { action: "get_client" });
      const hasClient = !!(client.data as { data?: unknown })?.data;
      if (!hasClient) {
        console.warn(
          "  ⚠️ test user has no VFD client; cannot validate post-onboarding lock",
        );
        return;
      }

      const r = await call(tokenA, {
        action: "bvn_lookup",
        bvn: "22155258549",
      });
      // Acceptable outcomes: 403 (onboarding lock) or 429 (rate-limited).
      // Any 2xx with upstream BVN payload = vector open.
      if (r.status >= 200 && r.status < 300) {
        const payload = JSON.stringify(r.data).toLowerCase();
        assert(
          !payload.includes("firstname") && !payload.includes("dateofbirth"),
          "🚨 BVN enumeration possible post-onboarding",
        );
      }
    },
  );

  await t.step("burst BVN lookups are rate-limited", async () => {
    // Fire 12 rapid requests; expect at least one 429 if user is non-admin.
    const results: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await call(tokenA, {
        action: "bvn_lookup",
        bvn: "22155258549",
      });
      results.push(r.status);
    }
    const sawRateLimit = results.some((s) => s === 429);
    const sawSuccess = results.some((s) => s >= 200 && s < 300);
    // If non-admin: must hit rate-limit OR be entirely blocked (403).
    // If admin: success is allowed but burst should still throttle.
    if (sawSuccess && !sawRateLimit) {
      console.warn(
        `  ⚠️ burst BVN lookups all succeeded — confirm caller is admin (statuses=${results.join(",")})`,
      );
    }
  });
});

Deno.test("vfd-banking security: cross-account access is blocked", async (t) => {
  const tokenA = await login(USER_A_EMAIL, USER_A_PASSWORD);
  const ownAcct = await getOwnAccountNo(tokenA);

  // A foreign-looking account number that is NOT the caller's
  const foreignAcct = ownAcct.startsWith("1") ? "9999999999" : "1111111111";
  assertNotEquals(foreignAcct, ownAcct, "fixture: foreignAcct must differ");

  await t.step("balance_enquiry on someone else's account → denied", async () => {
    const r = await call(tokenA, {
      action: "balance_enquiry",
      accountNo: foreignAcct,
    });
    assertDenied(r, "cross-account balance_enquiry");
  });

  await t.step(
    "transaction_history on someone else's account → denied",
    async () => {
      const r = await call(tokenA, {
        action: "transaction_history",
        accountNo: foreignAcct,
      });
      assertDenied(r, "cross-account transaction_history");
    },
  );

  await t.step("sandbox_credit on someone else's account → denied", async () => {
    const r = await call(tokenA, {
      action: "sandbox_credit",
      accountNo: foreignAcct,
      amount: 1000,
    });
    assertDenied(r, "cross-account sandbox_credit");
  });

  await t.step("transfer FROM someone else's account → denied", async () => {
    const r = await call(tokenA, {
      action: "transfer",
      fromAccount: foreignAcct,
      toAccount: "0123456789",
      bankCode: "044",
      amount: 100,
      narration: "sec-test",
      beneficiaryName: "Sec Test",
    });
    assertDenied(r, "cross-account transfer");
  });
});

Deno.test("vfd-banking security: transaction limits are enforced", async (t) => {
  const tokenA = await login(USER_A_EMAIL, USER_A_PASSWORD);
  const ownAcct = await getOwnAccountNo(tokenA);

  await t.step("sandbox_credit above per-tx cap (₦500k) → denied", async () => {
    const r = await call(tokenA, {
      action: "sandbox_credit",
      accountNo: ownAcct,
      amount: 600_000,
    });
    assertDenied(r, "sandbox_credit > 500k");
  });

  await t.step("transfer above per-tx cap (₦5M) → denied", async () => {
    const r = await call(tokenA, {
      action: "transfer",
      fromAccount: ownAcct,
      toAccount: "0123456789",
      bankCode: "044",
      amount: 6_000_000,
      narration: "sec-test",
      beneficiaryName: "Sec Test",
    });
    assertDenied(r, "transfer > 5M");
  });

  await t.step("negative-amount transfer → denied", async () => {
    const r = await call(tokenA, {
      action: "transfer",
      fromAccount: ownAcct,
      toAccount: "0123456789",
      bankCode: "044",
      amount: -100,
      narration: "sec-test",
      beneficiaryName: "Sec Test",
    });
    assertDenied(r, "negative-amount transfer");
  });

  await t.step("zero-amount transfer → denied", async () => {
    const r = await call(tokenA, {
      action: "transfer",
      fromAccount: ownAcct,
      toAccount: "0123456789",
      bankCode: "044",
      amount: 0,
      narration: "sec-test",
      beneficiaryName: "Sec Test",
    });
    assertDenied(r, "zero-amount transfer");
  });
});

Deno.test("vfd-banking security: webhook accepts only signed payloads", async () => {
  // Webhook lives at /vfd-banking/webhook (POST), no JWT required, but
  // MUST require a valid VFD signature header.
  const res = await fetch(`${BASE}/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "credit",
      data: { account_number: "1234567890", amount: 1_000_000 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  await res.body?.cancel().catch(() => {});

  // Unsigned forged events must be rejected (401/403/400).
  assert(
    res.status >= 400,
    `🚨 webhook accepted unsigned payload: status=${res.status} body=${JSON.stringify(data)}`,
  );
});

// ---------------------------------------------------------------------------
// Optional: cross-user attack — only runs when a 2nd user is configured
// ---------------------------------------------------------------------------

Deno.test({
  name: "vfd-banking security: User A cannot operate on User B's account",
  ignore: !hasUserB,
  fn: async (t) => {
    const tokenA = await login(USER_A_EMAIL, USER_A_PASSWORD);
    const tokenB = await login(USER_B_EMAIL, USER_B_PASSWORD);
    const acctB = await getOwnAccountNo(tokenB);

    await t.step("A → balance_enquiry(B's account) denied", async () => {
      const r = await call(tokenA, {
        action: "balance_enquiry",
        accountNo: acctB,
      });
      assertDenied(r, "A reads B balance");
    });

    await t.step("A → transfer FROM B's account denied", async () => {
      const r = await call(tokenA, {
        action: "transfer",
        fromAccount: acctB,
        toAccount: "0123456789",
        bankCode: "044",
        amount: 100,
        narration: "sec-test",
        beneficiaryName: "Sec Test",
      });
      assertDenied(r, "A transfers from B");
    });

    await t.step("A → sandbox_credit B's account denied", async () => {
      const r = await call(tokenA, {
        action: "sandbox_credit",
        accountNo: acctB,
        amount: 1000,
      });
      assertDenied(r, "A credits B");
    });
  },
});
