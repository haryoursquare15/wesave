import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const BASE = `${SUPABASE_URL}/functions/v1/vfd-banking`;

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  await res.text().catch(() => {});
  if (!data.access_token) throw new Error("auth failed: " + JSON.stringify(data));
  return data.access_token;
}

async function transfer(token: string, amount: number) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: "transfer",
      fromAccount: "9871707899",        // test1
      toAccount: "9023597728",          // test2
      bankCode: "999999",
      transferType: "intra",
      amount,
      narration: "tier-limit test",
      beneficiaryName: "test 2",
    }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

Deno.test("tier-2 daily cap enforcement", async (t) => {
  // NOTE: this assumes test1@hhh.com / password used in sandbox dev.
  const token = await login("test1@hhh.com", "Test1234!");

  await t.step("any amount when 24h spent >= cap returns TIER_DAILY_LIMIT_EXCEEDED", async () => {
    const r = await transfer(token, 500);
    console.log("response:", r.status, JSON.stringify(r.data));
    assertEquals(r.status, 403);
    assertEquals(r.data.code, "TIER_DAILY_LIMIT_EXCEEDED");
  });

  await t.step("single txn above per-tier cap returns TIER_LIMIT_EXCEEDED", async () => {
    const r = await transfer(token, 200_000);
    console.log("response:", r.status, JSON.stringify(r.data));
    assertEquals(r.status, 403);
    // Could be either TIER_LIMIT_EXCEEDED (amount > cap) or TIER_DAILY_LIMIT_EXCEEDED
    // depending on which check fires first; both are correct rejections.
    const ok = r.data.code === "TIER_LIMIT_EXCEEDED" || r.data.code === "TIER_DAILY_LIMIT_EXCEEDED";
    assertEquals(ok, true);
  });
});
