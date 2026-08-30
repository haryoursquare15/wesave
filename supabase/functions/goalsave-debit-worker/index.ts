// Goal Savings 2.0 — recurring DDM collection worker.
//
// IMPORTANT: Recurring contributions do NOT debit the user's Vestara wallet.
// Funds flow VFD Direct Debit Mandate (DDM) → settlement pool → goal savings
// lock account.
//
// This worker NEVER assumes money arrived. For every due installment it calls
// the ONE shared collection entry point (`collectMandateDebit` in
// _shared/vfd-mandate.ts), which atomically claims the attempt and fires the
// real VFD ACCOUNT DEBIT call. The internal ledger leg is booked only after
// VFD returns status "00".
//
// Reference convention (Vestara-originated): VES-GOAL-DEBIT-<savings_id>-<seq>
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyCronToken, unauthorized } from "../_shared/cron-auth.ts";
import { collectMandateDebit, markAttemptLedgerPosted } from "../_shared/vfd-mandate.ts";
import { sweepPoolToProductSubaccount } from "../_shared/vfd-pool-sweep.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
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

/**
 * PERMANENT RULE: every naira a DDM pulls into the Vestara corporate pool for a
 * Goal Savings contract is swept straight out of the pool into the Goal Savings
 * VFD sub-account. Idempotent per (savings_id, seq) — safe to retry forever.
 */
// deno-lint-ignore no-explicit-any
async function sweepInstallmentToSubaccount(db: any, row: {
  savings_id: string; user_id: string; seq: number; amount: number;
}) {
  const result = await sweepPoolToProductSubaccount({
    db,
    productCode: "goalsave",
    savingsId: row.savings_id,
    userId: row.user_id,
    amount: Number(row.amount),
    seq: row.seq,
    remark: `Goal Savings installment ${row.seq}`,
  });

  if (result.confirmed) {
    const nowIso = new Date().toISOString();
    await db.from("vestara_savings").update({
      sub_account_nuban: result.subAccountNuban ?? undefined,
      sub_account_transfer_ref: result.reference,
      sub_account_transferred_at: nowIso,
      subaccount_funded_at: nowIso,
    }).eq("id", row.savings_id);
    await db.from("vfd_savings_debit_schedule")
      .update({ swept_to_subaccount_at: nowIso, subaccount_sweep_ref: result.reference })
      .eq("savings_id", row.savings_id).eq("seq", row.seq)
      .then(() => {}, () => {});
  } else {
    console.error(
      `[goalsave][sweep] unswept savings=${row.savings_id} seq=${row.seq} ` +
      `ref=${result.reference} code=${result.code} error=${result.error}`,
    );
  }
  return result;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = admin();

  // Caller verification MUST run before any DB read/write. Service-to-service
  // only: the scheduler presents `x-cron-token`.
  if (!(await verifyCronToken(req, "goalsave_debit_worker", supabase))) {
    return unauthorized(corsHeaders);
  }

  const now = new Date().toISOString();

  // Resolve the single system settlement account (DDM funds land here from VFD)
  const { data: settlement, error: setErr } = await supabase
    .from("vestara_accounts")
    .select("id")
    .eq("account_type", "settlement")
    .is("user_id", null)
    .maybeSingle();

  if (setErr || !settlement) {
    return new Response(
      JSON.stringify({ error: "Settlement account not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

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
  let succeeded = 0, failed = 0, skipped = 0, swept = 0, sweepPending = 0;

  for (const r of rows) {
    try {
      // Re-load the savings plan
      const { data: s } = await supabase
        .from("vestara_savings")
        .select("id, user_id, lock_account_id, principal, tenor_count, activation_status, mandate_status, commitment_frequency, maturity_date, status")
        .eq("id", r.savings_id)
        .maybeSingle();

      // A bank-authorized mandate is the real gate. If the plan is still sitting
      // in `pending_mandate` (activation flip missed), heal it here rather than
      // silently skipping every installment.
      if (!s || s.mandate_status !== "authorized" || (s.activation_status !== "active" && s.activation_status !== "pending_mandate")) {
        skipped++;
        continue;
      }
      if (s.activation_status === "pending_mandate") {
        await supabase.from("vestara_savings")
          .update({ activation_status: "active" })
          .eq("id", s.id);
      }


      // --- REAL MONEY FIRST -------------------------------------------------
      // Pull the installment from the customer's bank via the mandate. No
      // ledger movement happens unless VFD confirms the debit.
      const { data: mandateRow } = await supabase
        .from("mandates")
        .select("id, mandate_reference, status")
        .eq("product_type", "fd_investment")
        .eq("product_reference", r.savings_id)
        .eq("user_id", r.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!mandateRow || mandateRow.status !== "bank_approved") {
        // Not bank-approved yet — leave the installment scheduled, never credit.
        await supabase.from("vfd_savings_debit_schedule")
          .update({ failed_reason: mandateRow ? `Mandate not bank-approved (${mandateRow.status})` : "Mandate not registered" })
          .eq("id", r.id);
        skipped++;
        continue;
      }

      const collection = await collectMandateDebit({
        db: supabase,
        mandateId: mandateRow.id as string,
        mandateReference: mandateRow.mandate_reference as string,
        amount: Number(r.amount),
        purpose: `Vestara Goal Savings installment ${r.seq}`,
        productRef: r.savings_id,
        scheduledDate: String(r.scheduled_at).slice(0, 10),
      });

      if (collection.skipped) {
        // Another worker already claimed this (mandate, date) pair.
        skipped++;
        continue;
      }

      if (!collection.collected) {
        const attempts = (r.attempt_count || 0) + 1;
        const reason = collection.reason || "VFD debit declined";
        await supabase.from("vfd_savings_debit_schedule")
          .update({
            status: attempts >= MAX_ATTEMPTS ? "failed" : "scheduled",
            attempt_count: attempts,
            failed_reason: reason.slice(0, 300),
            scheduled_at: attempts >= MAX_ATTEMPTS
              ? r.scheduled_at
              : new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
          })
          .eq("id", r.id);

        await supabase.from("user_notifications").insert({
          user_id: r.user_id,
          title: "Goal Savings contribution not collected",
          message: collection.failureClass === "insufficient_funds"
            ? `Your bank declined the NGN ${Number(r.amount).toLocaleString()} Goal Savings installment for insufficient funds. Please fund the account before the next scheduled date.`
            : `We could not collect your NGN ${Number(r.amount).toLocaleString()} Goal Savings installment. ${reason}`,
          notification_type: "mandate_debit_failed",
        }).then(() => {}, () => {});

        failed++;
        continue;
      }

      // --- VFD CONFIRMED (status "00") — now book the internal credit leg ----
      // settlement (debit) → user's lock account (credit). No user wallet involvement.
      const reference = `VES-GOAL-DEBIT-${r.savings_id}-${r.seq}`;
      const { data: txResult, error: txErr } = await supabase.rpc("vestara_post_transaction", {
        _type: "lock",
        _reference: reference,
        _amount: r.amount,
        _initiated_by: s.user_id,
        _entries: [
          { account_id: settlement.id, debit: r.amount, credit: 0 },
          { account_id: s.lock_account_id, debit: 0, credit: r.amount },
        ],
        _metadata: {
          source: "goalsave_ddm_settlement",
          product_code: "goalsave",
          savings_id: r.savings_id,
          seq: r.seq,
          funding_channel: "vfd_direct_debit_mandate",
          mandate_id: mandateRow.id,
          mandate_reference: mandateRow.mandate_reference,
          vfd_debit_attempt_id: collection.attemptId,
        },
      });

      const okPosted =
        !txErr &&
        txResult &&
        (typeof txResult === "object" ? (txResult as Record<string, unknown>).success !== false : true);

      if (!okPosted) {
        // Money WAS collected at VFD but the internal leg failed — flag for ops
        // rather than retrying the debit, which would double-charge the customer.
        const reason = txErr?.message || JSON.stringify(txResult)?.slice(0, 200) || "post_transaction_failed";
        await markAttemptLedgerPosted(supabase, collection.attemptId, null, false);
        await supabase.from("vfd_savings_debit_schedule")
          .update({
            status: "needs_review",
            attempt_count: (r.attempt_count || 0) + 1,
            failed_reason: `COLLECTED AT VFD BUT LEDGER POST FAILED: ${reason}`.slice(0, 300),
          })
          .eq("id", r.id);
        failed++;
        continue;
      }

      await markAttemptLedgerPosted(supabase, collection.attemptId, reference, true);

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

      // IMMEDIATE SWEEP: pool -> Goal Savings sub-account, same run.
      const sweep = await sweepInstallmentToSubaccount(supabase, {
        savings_id: r.savings_id, user_id: r.user_id, seq: r.seq, amount: Number(r.amount),
      });
      if (sweep.confirmed) swept++; else sweepPending++;

      await supabase.from("user_notifications").insert({
        user_id: r.user_id,
        title: "Goal Savings contribution collected",
        message: `NGN ${Number(r.amount).toLocaleString()} was debited from your bank account and added to your Goal Savings plan.`,
        notification_type: "mandate_debit_succeeded",
      }).then(() => {}, () => {});

      succeeded++;

    } catch (e) {
      failed++;
      const reason = e instanceof Error ? e.message : String(e);
      await supabase.from("vfd_savings_debit_schedule")
        .update({ failed_reason: reason.slice(0, 300) })
        .eq("id", r.id);
    }
  }

  // ---- RECOVERY PASS -------------------------------------------------------
  // Any Goal Savings installment already collected into the pool but not yet
  // confirmed inside the Goal Savings sub-account is retried every run, so a
  // failed/uncertain sweep can never leave customer money parked in the pool.
  let recovered = 0, stillPending = 0;
  try {
    const { data: collected } = await supabase
      .from("vfd_savings_debit_schedule")
      .select("savings_id, user_id, seq, amount, vestara_savings!inner(product_code)")
      .eq("status", "succeeded")
      .eq("vestara_savings.product_code", "goalsave")
      .order("collected_at", { ascending: true })
      .limit(200);

    for (const c of (collected ?? []) as Array<{ savings_id: string; user_id: string; seq: number; amount: number }>) {
      const ref = `SWEEP-GOALSAVE-${c.savings_id.replace(/-/g, "").slice(0, 16)}-${c.seq}`;
      const { data: rec } = await supabase.from("settlement_records")
        .select("status").eq("provider", "vfd").eq("provider_reference", ref).maybeSingle();
      if (rec?.status === "confirmed") continue;

      const res = await sweepInstallmentToSubaccount(supabase, {
        savings_id: c.savings_id, user_id: c.user_id, seq: c.seq, amount: Number(c.amount),
      });
      if (res.confirmed) recovered++; else stillPending++;
    }
  } catch (e) {
    console.error("[goalsave][sweep-recovery]", e instanceof Error ? e.message : String(e));
  }

  return new Response(
    JSON.stringify({
      processed: rows.length, succeeded, failed, skipped,
      swept, sweep_pending: sweepPending, sweep_recovered: recovered, sweep_still_pending: stillPending,
      ran_at: now,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

