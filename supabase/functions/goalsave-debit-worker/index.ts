// Goal Savings 2.0 — recurring debit worker.
// Runs on cron. For every `vfd_savings_debit_schedule` row whose
// `scheduled_at` is due and parent savings is active+authorized,
// debits the user's wallet into their goal savings lock account
// via the double-entry vestara_post_transaction RPC, marks the
// schedule row succeeded, advances next_debit_at, and matures
// the plan when the final installment lands.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const MAX_ATTEMPTS = 3;

interface DebitRow {
  id: string;
  savings_id: string;
  user_id: string;
  seq: number;
  scheduled_at: string;
  amount: number;
  attempt_count: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = admin();
  const now = new Date().toISOString();

  // Pull due, scheduled debits (cap each run)
  const { data: due, error } = await supabase
    .from("vfd_savings_debit_schedule")
    .select("id, savings_id, user_id, seq, scheduled_at, amount, attempt_count")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (due ?? []) as DebitRow[];
  let succeeded = 0, failed = 0, skipped = 0;

  for (const r of rows) {
    try {
      // Re-load the savings plan
      const { data: s } = await supabase
        .from("vestara_savings")
        .select("id, user_id, lock_account_id, principal, tenor_count, activation_status, mandate_status, commitment_frequency, maturity_date, status")
        .eq("id", r.savings_id)
        .maybeSingle();

      if (!s || s.activation_status !== "active" || s.mandate_status !== "authorized") {
        skipped++;
        continue;
      }

      // Wallet account
      const { data: wallet } = await supabase
        .from("vestara_accounts")
        .select("id, balance")
        .eq("user_id", s.user_id)
        .eq("account_type", "wallet")
        .maybeSingle();

      if (!wallet || Number(wallet.balance) < Number(r.amount)) {
        const attempts = (r.attempt_count || 0) + 1;
        const next = attempts >= MAX_ATTEMPTS ? "failed" : "retrying";
        await supabase.from("vfd_savings_debit_schedule")
          .update({
            status: next,
            attempt_count: attempts,
            failed_reason: "Insufficient wallet balance",
          })
          .eq("id", r.id);
        // If still retryable, push 24h forward
        if (next === "retrying") {
          const retryAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
          await supabase.from("vfd_savings_debit_schedule")
            .update({ status: "scheduled", scheduled_at: retryAt })
            .eq("id", r.id);
        }
        failed++;
        continue;
      }

      const reference = `GOALSAVE-DEBIT-${r.savings_id}-${r.seq}`;
      const { data: txResult, error: txErr } = await supabase.rpc("vestara_post_transaction", {
        _type: "lock",
        _reference: reference,
        _amount: r.amount,
        _initiated_by: s.user_id,
        _entries: [
          { account_id: wallet.id, debit: r.amount, credit: 0 },
          { account_id: s.lock_account_id, debit: 0, credit: r.amount },
        ],
        _metadata: {
          source: "goalsave_recurring_debit",
          product_code: "goalsave",
          savings_id: r.savings_id,
          seq: r.seq,
        },
      });

      const okPosted =
        !txErr &&
        txResult &&
        (typeof txResult === "object" ? (txResult as Record<string, unknown>).success !== false : true);

      if (!okPosted) {
        const reason = txErr?.message || JSON.stringify(txResult)?.slice(0, 200) || "post_transaction_failed";
        const attempts = (r.attempt_count || 0) + 1;
        await supabase.from("vfd_savings_debit_schedule")
          .update({
            status: attempts >= MAX_ATTEMPTS ? "failed" : "scheduled",
            attempt_count: attempts,
            failed_reason: reason,
            scheduled_at: attempts >= MAX_ATTEMPTS
              ? r.scheduled_at
              : new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
          })
          .eq("id", r.id);
        failed++;
        continue;
      }

      // Mark schedule succeeded
      await supabase.from("vfd_savings_debit_schedule")
        .update({
          status: "succeeded",
          attempt_count: (r.attempt_count || 0) + 1,
          vfd_reference: reference,
          collected_at: new Date().toISOString(),
          failed_reason: null,
        })
        .eq("id", r.id);

      // Bump principal + next_debit_at on the savings row
      const newPrincipal = Number(s.principal || 0) + Number(r.amount);

      const { data: nextRow } = await supabase
        .from("vfd_savings_debit_schedule")
        .select("scheduled_at")
        .eq("savings_id", r.savings_id)
        .eq("status", "scheduled")
        .order("seq", { ascending: true })
        .limit(1)
        .maybeSingle();

      const updates: Record<string, unknown> = {
        principal: newPrincipal,
        original_principal: newPrincipal,
        next_debit_at: nextRow?.scheduled_at || null,
      };

      // Mature if final installment and past maturity
      if (!nextRow && new Date(s.maturity_date).getTime() <= Date.now()) {
        updates.activation_status = "matured";
        updates.status = "matured";
        updates.matured_at = new Date().toISOString();
      }

      await supabase.from("vestara_savings").update(updates).eq("id", r.savings_id);
      succeeded++;
    } catch (e) {
      failed++;
      const reason = e instanceof Error ? e.message : String(e);
      await supabase.from("vfd_savings_debit_schedule")
        .update({ failed_reason: reason.slice(0, 300) })
        .eq("id", r.id);
    }
  }

  return new Response(
    JSON.stringify({ processed: rows.length, succeeded, failed, skipped, ran_at: now }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
