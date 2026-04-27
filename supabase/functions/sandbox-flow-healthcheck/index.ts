// Sandbox flow health probe.
// Periodically inspects critical money-moving and product flows in the VFD
// sandbox and writes per-flow status to the public.flow_health table.
// Probes are READ-ONLY. They infer health from completion ratios over 24h.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ProbeResult = {
  flow_name: string;
  status: "healthy" | "degraded" | "down" | "idle";
  success_rate: number;
  last_error: string | null;
  details: Record<string, unknown>;
};

function getAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function classify(total: number, ok: number): ProbeResult["status"] {
  if (total === 0) return "idle";
  const rate = ok / total;
  if (rate >= 0.95) return "healthy";
  if (rate >= 0.7) return "degraded";
  return "down";
}

async function safeProbe(
  name: string,
  fn: () => Promise<ProbeResult>,
): Promise<ProbeResult> {
  try {
    return await fn();
  } catch (err) {
    return {
      flow_name: name,
      status: "down",
      success_rate: 0,
      last_error: err instanceof Error ? err.message : String(err),
      details: {},
    };
  }
}

const SINCE = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

async function probeTransactions(
  flowName: string,
  txType: string,
): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_transactions")
    .select("id, status")
    .eq("transaction_type", txType)
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["completed", "successful", "success"].includes(String(r.status).toLowerCase())
  ).length;
  const failed = (data ?? []).filter((r: any) =>
    ["failed", "error"].includes(String(r.status).toLowerCase())
  ).length;
  return {
    flow_name: flowName,
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: failed ? `${failed} failed in last 24h` : null,
    details: { total, ok, failed, window: "24h" },
  };
}

async function probeCrowdfunding(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_campaign_contributions")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["completed", "successful"].includes(String(r.status).toLowerCase())
  ).length;
  return {
    flow_name: "crowdfunding_contributions",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeThriftContributions(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_group_contributions")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["completed", "paid", "successful"].includes(String(r.status).toLowerCase())
  ).length;
  return {
    flow_name: "thrift_contributions",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeSplitPay(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_split_transactions")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["completed", "settled", "successful"].includes(String(r.status).toLowerCase())
  ).length;
  return {
    flow_name: "split_pay",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeTargetAjo(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_target_contributions")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["completed", "successful", "paid"].includes(String(r.status).toLowerCase())
  ).length;
  return {
    flow_name: "target_ajo",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeBalanceIntegrity(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_user_balances")
    .select("user_id, total_balance, locked_balance, savings_balance, available_balance")
    .limit(1000);
  if (error) throw error;
  const negatives = (data ?? []).filter(
    (r: any) =>
      Number(r.total_balance) < 0 ||
      Number(r.locked_balance) < 0 ||
      Number(r.savings_balance) < 0 ||
      Number(r.available_balance) < 0,
  );
  // Drift: available != total - locked - savings
  const drifts = (data ?? []).filter((r: any) => {
    const expected = Number(r.total_balance) - Number(r.locked_balance) - Number(r.savings_balance);
    return Math.abs(expected - Number(r.available_balance)) > 0.01;
  });
  const total = data?.length ?? 0;
  const issues = negatives.length + drifts.length;
  const ok = Math.max(0, total - issues);
  return {
    flow_name: "balance_integrity",
    status: issues === 0 ? "healthy" : issues > total * 0.05 ? "down" : "degraded",
    success_rate: total ? ok / total : 1,
    last_error: issues
      ? `${negatives.length} negatives, ${drifts.length} drift accounts`
      : null,
    details: { checked: total, negatives: negatives.length, drifts: drifts.length },
  };
}

async function probeLockedFunds(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_locked_funds")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["active", "released", "matured"].includes(String(r.status).toLowerCase())
  ).length;
  return {
    flow_name: "locked_funds",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeVestaraSavings(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vestara_savings")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["active", "matured", "completed"].includes(String(r.status).toLowerCase())
  ).length;
  return {
    flow_name: "vestara_savings",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function runAllProbes(): Promise<ProbeResult[]> {
  return await Promise.all([
    safeProbe("wallet_funding", () => probeTransactions("wallet_funding", "credit")),
    safeProbe("wallet_debits", () => probeTransactions("wallet_debits", "debit")),
    safeProbe("wallet_transfers", () => probeTransactions("wallet_transfers", "transfer")),
    safeProbe("crowdfunding_contributions", probeCrowdfunding),
    safeProbe("thrift_contributions", probeThriftContributions),
    safeProbe("split_pay", probeSplitPay),
    safeProbe("target_ajo", probeTargetAjo),
    safeProbe("locked_funds", probeLockedFunds),
    safeProbe("vestara_savings", probeVestaraSavings),
    safeProbe("balance_integrity", probeBalanceIntegrity),
  ]);
}

async function persistResults(results: ProbeResult[]) {
  const db = getAdmin();
  const rows = results.map((r) => ({
    flow_name: r.flow_name,
    status: r.status,
    success_rate: r.success_rate,
    last_error: r.last_error,
    details: r.details,
    checked_at: new Date().toISOString(),
  }));
  const { error } = await db.from("flow_health").insert(rows);
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const results = await runAllProbes();
    await persistResults(results);
    const overall = results.every((r) => r.status === "healthy" || r.status === "idle")
      ? "healthy"
      : results.some((r) => r.status === "down")
      ? "down"
      : "degraded";
    return new Response(
      JSON.stringify({ checked_at: new Date().toISOString(), overall, flows: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
