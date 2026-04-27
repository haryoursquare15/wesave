// Sandbox flow health probe.
// Periodically inspects critical money-moving and product flows in the VFD
// sandbox and writes per-flow status to the public.flow_health table.
//
// Probes are intentionally READ-ONLY. They look at recent activity in the
// last 24h and infer health from completion ratios. No funds are moved.

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

async function probeWalletFunding(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_ledger")
    .select("id, status, entry_type")
    .eq("entry_type", "credit")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) => r.status === "completed").length;
  return {
    flow_name: "wallet_funding",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeWalletTransfers(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_transfers")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["completed", "successful"].includes(r.status)
  ).length;
  return {
    flow_name: "wallet_transfers",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeSavings(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_savings")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["active", "matured", "completed"].includes(r.status)
  ).length;
  return {
    flow_name: "savings_creation",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeLockedFunds(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_locks")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["active", "released", "matured"].includes(r.status)
  ).length;
  return {
    flow_name: "locked_funds",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeCrowdfunding(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_campaigns")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["active", "completed", "funded"].includes(r.status ?? "active")
  ).length;
  return {
    flow_name: "crowdfunding",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeContributions(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_contributions")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["completed", "successful", "paid"].includes(r.status)
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
    .from("vfd_sandbox_split_requests")
    .select("id, status")
    .gte("created_at", SINCE());
  if (error) throw error;
  const total = data?.length ?? 0;
  const ok = (data ?? []).filter((r: any) =>
    ["settled", "completed", "active"].includes(r.status)
  ).length;
  return {
    flow_name: "split_pay",
    status: classify(total, ok),
    success_rate: total ? ok / total : 1,
    last_error: null,
    details: { total, ok, window: "24h" },
  };
}

async function probeBalanceIntegrity(): Promise<ProbeResult> {
  const db = getAdmin();
  const { data, error } = await db
    .from("vfd_sandbox_balances")
    .select("user_id, total_balance, locked_balance, savings_balance")
    .limit(1000);
  if (error) throw error;
  const negatives = (data ?? []).filter(
    (r: any) =>
      Number(r.total_balance) < 0 ||
      Number(r.locked_balance) < 0 ||
      Number(r.savings_balance) < 0,
  );
  const total = data?.length ?? 0;
  const ok = total - negatives.length;
  return {
    flow_name: "balance_integrity",
    status: negatives.length === 0 ? "healthy" : "down",
    success_rate: total ? ok / total : 1,
    last_error: negatives.length
      ? `${negatives.length} accounts with negative balance`
      : null,
    details: { checked: total, negatives: negatives.length },
  };
}

async function runAllProbes(): Promise<ProbeResult[]> {
  return await Promise.all([
    safeProbe("wallet_funding", probeWalletFunding),
    safeProbe("wallet_transfers", probeWalletTransfers),
    safeProbe("savings_creation", probeSavings),
    safeProbe("locked_funds", probeLockedFunds),
    safeProbe("crowdfunding", probeCrowdfunding),
    safeProbe("thrift_contributions", probeContributions),
    safeProbe("split_pay", probeSplitPay),
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
    const summary = {
      checked_at: new Date().toISOString(),
      flows: results,
      overall: results.every((r) => r.status === "healthy" || r.status === "idle")
        ? "healthy"
        : results.some((r) => r.status === "down")
        ? "down"
        : "degraded",
    };
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
