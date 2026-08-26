// Vestara — VFD Direct-Mandate Debit Engine
//
// Owns the full mandate lifecycle for BOTH recurring products:
//   product_type = 'thrift'         (Ajo / thrift group contributions)
//   product_type = 'target_ajo'     (Target Ajo group contributions)
//   product_type = 'fd_investment'  (fixed-deposit / savings recurring deposits)
//
// Collection ownership (exactly one worker collects per product, and all three
// call the SAME shared `collectMandateDebit`):
//   thrift        -> vfd-sandbox-products `sandbox_auto_contribute` cycle sweep
//   fd_investment -> goalsave-debit-worker (installment schedule)
//   target_ajo    -> this engine's `run_due_debits`
//
// Architecture rules enforced here:
//  * Every VFD call runs server-side; debit + polling actions require the
//    internal cron token and are never reachable from a browser.
//  * Debits are idempotent: `claim_mandate_debit_attempt` atomically claims
//    (mandate_id, scheduled_date) before VFD is ever called. A duplicate cron
//    fire, retry or concurrent invocation gets `claimed:false` and skips.
//  * The internal ledger is credited ONLY after VFD returns status "00".
//  * Every stage writes a structured row to `mandate_events`.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { verifyCronToken } from "../_shared/cron-auth.ts";
import {
import { notifyMandateApproved } from "../_shared/mandate-notify.ts";
  MANDATE_EXPIRY_DAYS,
  MANDATE_INTERNAL_SHARE,
  MANDATE_MIN_AMOUNT,
  MANDATE_NIBSS_SHARE,
  MANDATE_SETUP_FEE,
  MANDATE_TEST_MODE,
  VFD_IS_PRODUCTION,
  VFD_MANDATE_BASE,
  VFD_MANDATE_CREATE_PATH,
  VFD_POOL_NUBAN,
  formatVfdMandateDate,
  addCycles,
  checkMandateApproval,
  createMandate,
  collectMandateDebit,
  markAttemptLedgerPosted,
  getLastMandateTokenSource,
  probeMandateTokenSources,
  probeCredentialMint,
  mapFrequencyToVfd,
  type MandatePayer,
} from "../_shared/vfd-mandate.ts";
import { vfdFetch } from "../_shared/vfd-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token",
};

const CRON_TOKEN_NAME = "mandate_engine";

function db(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireUser(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data, error } = await db().auth.getClaims(auth.replace("Bearer ", ""));
  const uid = data?.claims?.sub as string | undefined;
  return error || !uid ? null : uid;
}

async function logEvent(
  mandateId: string | null,
  userId: string | null,
  reference: string | null,
  eventType: string,
  payload: Record<string, unknown>,
) {
  try {
    await db().from("mandate_events").insert({
      mandate_id: mandateId,
      user_id: userId,
      mandate_reference: reference,
      event_type: eventType,
      payload,
    });
  } catch (e) {
    console.error("[mandate-engine] event log failed", eventType, e);
  }
}

async function notify(userId: string, title: string, message: string, type: string) {
  try {
    await db().from("user_notifications").insert({
      user_id: userId, title, message, notification_type: type,
    });
  } catch (e) {
    console.error("[mandate-engine] notify failed", e);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Stage 1 — mandate creation
// ---------------------------------------------------------------------------
function validatePayer(body: Record<string, unknown>):
  { ok: true; payer: MandatePayer } | { ok: false; error: string; code: string } {
  const bankCode = String(body.payer_bank_code || "").trim();
  const accountNumber = String(body.payer_account_number || "").trim();
  const phone = String(body.payer_phone || "").trim();
  const email = String(body.payer_email || "").trim();
  const address = String(body.payer_address || "").trim();
  if (!bankCode || !accountNumber || !phone || !email || !address) {
    return { ok: false, code: "PAYER_DETAILS_REQUIRED",
      error: "Bank, account number, phone, email and address are all required to authorize a Direct Debit Mandate." };
  }
  if (!/^\d{10}$/.test(accountNumber)) {
    return { ok: false, code: "INVALID_ACCOUNT_NUMBER", error: "Account number must be 10 digits." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, code: "INVALID_EMAIL", error: "Enter a valid email address." };
  }
  return { ok: true, payer: { bankCode, accountNumber, phone, email, address } };
}

async function chargeSetupFee(userId: string, feeRef: string, ctx: Record<string, unknown>) {
  const supabase = db();
  const { error } = await supabase.rpc("vestara_withdraw", {
    _user_id: userId,
    _amount: MANDATE_SETUP_FEE,
    _reference: feeRef,
    _metadata: { source: "mandate_setup_fee", ...ctx },
  });
  if (error) return { ok: false as const };
  // ₦100 = ₦50 internal management + ₦50 NIBSS authentication.
  await supabase.from("vestara_fee_ledger").insert([
    { user_id: userId, fee_type: "mandate_setup_internal", amount: MANDATE_INTERNAL_SHARE,
      reference: `${feeRef}-INT`, tx_reference: feeRef,
      metadata: { ...ctx, split: "internal", parent_fee: MANDATE_SETUP_FEE } },
    { user_id: userId, fee_type: "mandate_setup_nibss", amount: MANDATE_NIBSS_SHARE,
      reference: `${feeRef}-NIBSS`, tx_reference: feeRef,
      metadata: { ...ctx, split: "nibss", parent_fee: MANDATE_SETUP_FEE } },
  ]);
  return { ok: true as const };
}

async function refundSetupFee(userId: string, feeRef: string, ctx: Record<string, unknown>) {
  try {
    const { data, error } = await db().rpc("vestara_deposit", {
      _user_id: userId,
      _amount: MANDATE_SETUP_FEE,
      _reference: `${feeRef}-REFUND`,
      _metadata: { source: "mandate_setup_fee_refund", original_reference: feeRef, ...ctx },
    });
    return !error && !!(data as { success?: boolean } | null)?.success;
  } catch {
    return false;
  }
}

async function handleCreateMandate(userId: string, body: Record<string, unknown>) {
  const supabase = db();
  const productType = String(body.product_type || "");
  const productReference = String(body.product_reference || "").trim();
  if (!["thrift", "target_ajo", "fd_investment"].includes(productType)) {
    return json({ error: "product_type must be 'thrift', 'target_ajo' or 'fd_investment'", code: "INVALID_PRODUCT_TYPE" }, 400);
  }
  if (!productReference) return json({ error: "product_reference is required", code: "INVALID_PRODUCT" }, 400);

  const payerCheck = validatePayer(body);
  if (!payerCheck.ok) return json({ error: payerCheck.error, code: payerCheck.code }, 400);

  const requested = Number(body.amount) || 0;
  if (requested <= 0) return json({ error: "amount must be greater than zero", code: "INVALID_AMOUNT" }, 400);
  const amount = Math.max(MANDATE_MIN_AMOUNT, Math.round(requested));
  const frequency = mapFrequencyToVfd(String(body.frequency || body.period || "monthly"));
  const totalCycles = Math.max(1, Number(body.total_cycles) || 12);

  // One live mandate per (user, product) — never charge the fee twice.
  const { data: existing } = await supabase.from("mandates")
    .select("id, status, mandate_reference, mandate_code, nibss_account, nibss_message, expires_at")
    .eq("user_id", userId).eq("product_type", productType).eq("product_reference", productReference)
    .in("status", ["pending", "bank_approved"]).maybeSingle();
  if (existing) {
    return json({ data: { success: true, already_exists: true, mandate: existing } });
  }

  const feeRef = `VES-MND-${productType}-${productReference.slice(0, 8)}-${userId.slice(0, 8)}-${Date.now()}`;
  const feeCtx = { product_type: productType, product_reference: productReference };
  const fee = await chargeSetupFee(userId, feeRef, feeCtx);
  if (!fee.ok) {
    return json({
      error: `Insufficient wallet balance for the ₦${MANDATE_SETUP_FEE} mandate setup fee (₦${MANDATE_INTERNAL_SHARE} Vestara management + ₦${MANDATE_NIBSS_SHARE} NIBSS authentication). Please fund your wallet and try again.`,
      code: "INSUFFICIENT_BALANCE", required: MANDATE_SETUP_FEE,
    }, 400);
  }

  const reference = `vestara-ddm-${productType}-${productReference.slice(0, 8)}-${userId.slice(0, 8)}-${Date.now()}`;
  const startDate = body.start_date ? new Date(String(body.start_date)) : new Date();
  const endDate = addCycles(startDate, frequency, totalCycles + 2);

  const vfd = await createMandate({ reference, payer: payerCheck.payer, amount, frequency, startDate, endDate });

  if (!vfd.created) {
    const refunded = await refundSetupFee(userId, feeRef, feeCtx);
    await logEvent(null, userId, reference, "create_failed", { ...vfd.raw, fee_refunded: refunded });
    return json({
      error: refunded
        ? "Your bank's mandate service didn't accept the request. The ₦100 setup fee has been returned to your wallet — please try again shortly."
        : "Your bank's mandate service didn't accept the request. The ₦100 setup fee is being reviewed by our team.",
      code: "MANDATE_VFD_FAILED",
      fee_refunded: refunded,
    }, 502);
  }

  const nowIso = new Date().toISOString();
  const { data: mandate, error: insErr } = await supabase.from("mandates").insert({
    user_id: userId,
    product_type: productType,
    product_reference: productReference,
    mandate_reference: reference,
    mandate_code: vfd.mandateCode || null,
    status: "pending",
    amount,
    frequency,
    start_date: startDate.toISOString().slice(0, 10),
    end_date: endDate.toISOString().slice(0, 10),
    payer_bank_code: payerCheck.payer.bankCode,
    payer_account_number: payerCheck.payer.accountNumber,
    payer_phone: payerCheck.payer.phone,
    payer_email: payerCheck.payer.email,
    payer_address: payerCheck.payer.address,
    nibss_account: vfd.nibssAccount || null,
    nibss_message: vfd.nibssMessage || null,
    setup_fee: MANDATE_SETUP_FEE,
    setup_fee_internal_share: MANDATE_INTERNAL_SHARE,
    setup_fee_nibss_share: MANDATE_NIBSS_SHARE,
    setup_fee_reference: feeRef,
    setup_fee_charged_at: nowIso,
    vfd_payload: vfd.raw,
    expires_at: new Date(Date.now() + MANDATE_EXPIRY_DAYS * 86400_000).toISOString(),
  }).select("*").single();

  if (insErr || !mandate) {
    console.error("[mandate-engine] mandate insert failed", insErr);
    await logEvent(null, userId, reference, "persist_failed", { error: insErr?.message, vfd: vfd.raw });
    return json({ error: "Mandate was created at the bank but could not be saved. Our team has been notified.", code: "MANDATE_PERSIST_FAILED" }, 500);
  }

  await logEvent(mandate.id, userId, reference, "created", {
    vfd: vfd.raw,
    setup_fee: MANDATE_SETUP_FEE,
    fee_split: { internal: MANDATE_INTERNAL_SHARE, nibss: MANDATE_NIBSS_SHARE },
  });

  await notify(userId, "Authorize your Direct Debit Mandate",
    `Send NGN ${MANDATE_NIBSS_SHARE} from your bank account ${payerCheck.payer.accountNumber} to NIBSS account ${vfd.nibssAccount || "(shown in-app)"} within ${MANDATE_EXPIRY_DAYS} days to activate automatic contributions.`,
    "mandate_pending_authorization");

  return json({
    data: {
      success: true,
      mandate_id: mandate.id,
      status: "pending",
      mandate_reference: reference,
      mandate_code: vfd.mandateCode,
      nibss_account: vfd.nibssAccount,
      nibss_message: vfd.nibssMessage,
      nibss_fee: MANDATE_NIBSS_SHARE,
      setup_fee: MANDATE_SETUP_FEE,
      setup_fee_split: { vestara_management: MANDATE_INTERNAL_SHARE, nibss_authentication: MANDATE_NIBSS_SHARE },
      expires_at: mandate.expires_at,
    },
  });
}

// ---------------------------------------------------------------------------
// Stage 2 — scheduled approval-status polling
// ---------------------------------------------------------------------------
async function markProductFailed(mandate: Record<string, any>, reason: string) {
  const supabase = db();
  try {
    if (mandate.product_type === "thrift") {
      await supabase.from("vfd_sandbox_group_members")
        .update({ mandate_status: "failed" })
        .eq("group_id", mandate.product_reference)
        .eq("user_id", mandate.user_id);
    } else if (mandate.product_type === "target_ajo") {
      await supabase.from("vfd_sandbox_target_members")
        .update({ mandate_status: "failed" })
        .eq("target_id", mandate.product_reference)
        .eq("user_id", mandate.user_id);
    } else {
      await supabase.from("vfd_savings_debit_schedule")
        .update({ status: "failed", failed_reason: reason })
        .eq("savings_id", mandate.product_reference)
        .eq("user_id", mandate.user_id)
        .eq("status", "pending");
    }
  } catch (e) {
    console.error("[mandate-engine] product failure flag failed", e);
  }
}

/** Mirror a bank approval back onto the owning product row. */
async function markProductApproved(mandate: Record<string, any>, nowIso: string) {
  const supabase = db();
  try {
    if (mandate.product_type === "thrift") {
      await supabase.from("vfd_sandbox_group_members")
        .update({ mandate_status: "authorized", mandate_authorized_at: nowIso })
        .eq("group_id", mandate.product_reference).eq("user_id", mandate.user_id);
    } else if (mandate.product_type === "target_ajo") {
      await supabase.from("vfd_sandbox_target_members")
        .update({ mandate_status: "authorized", mandate_authorized_at: nowIso })
        .eq("target_id", mandate.product_reference).eq("user_id", mandate.user_id);
    } else {
      await supabase.from("vestara_savings")
        .update({ mandate_status: "authorized", mandate_authorized_at: nowIso })
        .eq("id", mandate.product_reference);
    }
  } catch (e) {
    console.error("[mandate-engine] product approval flag failed", e);
  }
}

async function handlePollPending(limit: number) {
  const supabase = db();
  const { data: pending } = await supabase.from("mandates")
    .select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(limit);

  const results: Array<Record<string, unknown>> = [];
  for (const m of pending || []) {
    const nowIso = new Date().toISOString();
    const expired = new Date(m.expires_at as string).getTime() <= Date.now();

    const approval = MANDATE_TEST_MODE
      ? { approved: true, rejected: false, status: "TEST_MODE_AUTO_APPROVED", raw: { test_mode: true }, http_status: 200 }
      : await checkMandateApproval(m.mandate_reference as string);

    await supabase.from("mandates").update({
      last_polled_at: nowIso,
      poll_count: (Number(m.poll_count) || 0) + 1,
    }).eq("id", m.id);

    await logEvent(m.id, m.user_id, m.mandate_reference, "status_polled", {
      approved: approval.approved, rejected: approval.rejected, status: approval.status, http_status: approval.http_status,
    });

    if (approval.approved) {
      await supabase.from("mandates").update({
        status: "bank_approved", bank_approved_at: nowIso, resolved_at: nowIso,
        vfd_payload: approval.raw,
      }).eq("id", m.id).eq("status", "pending");
      await markProductApproved(m, nowIso);
      await logEvent(m.id, m.user_id, m.mandate_reference, "bank_approved", { status: approval.status });
      await notify(m.user_id as string, "Direct Debit Mandate active",
        "Your bank approved the mandate. Scheduled contributions will now be collected automatically.",
        "mandate_bank_approved");
      await notifyMandateApproved(supabase, {
        userId: m.user_id as string,
        productType: String(m.product_type),
        productReference: (m.product_reference as string) || null,
        mandateReference: (m.mandate_reference as string) || null,
      });
      results.push({ mandate_id: m.id, outcome: "bank_approved" });
      continue;
    }

    if (approval.rejected || expired) {
      const status = approval.rejected ? "rejected" : "expired";
      const reason = approval.rejected
        ? `Bank rejected the mandate: ${approval.status}`
        : `No bank approval within ${MANDATE_EXPIRY_DAYS} days`;
      await supabase.from("mandates").update({
        status, resolved_at: nowIso, rejection_reason: reason, vfd_payload: approval.raw,
      }).eq("id", m.id).eq("status", "pending");
      await markProductFailed(m, reason);
      await logEvent(m.id, m.user_id, m.mandate_reference, status, { reason, vfd: approval.raw });
      await notify(m.user_id as string,
        status === "rejected" ? "Direct Debit Mandate rejected" : "Direct Debit Mandate expired",
        `${reason}. Your scheduled contribution could not be set up — please set up the mandate again from the app.`,
        `mandate_${status}`);
      results.push({ mandate_id: m.id, outcome: status });
      continue;
    }

    results.push({ mandate_id: m.id, outcome: "still_pending", bank_status: approval.status });
  }

  return json({ data: { polled: (pending || []).length, results } });
}

// ---------------------------------------------------------------------------
// Stage 3 — scheduled debit
// ---------------------------------------------------------------------------
/** The cadence slot that falls on/before today, or null when today is not due. */
function dueDateForMandate(m: Record<string, any>): string | null {
  const start = new Date(`${m.start_date}T00:00:00Z`);
  const now = new Date(`${today()}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || now < start) return null;
  if (m.end_date && now > new Date(`${m.end_date}T00:00:00Z`)) return null;
  const freq = String(m.frequency || "3");
  if (freq === "1") return today();
  const dayMs = 86400_000;
  if (freq === "2") {
    const diffDays = Math.floor((now.getTime() - start.getTime()) / dayMs);
    return diffDays % 7 === 0 ? today() : null;
  }
  return now.getUTCDate() === start.getUTCDate() ? today() : null;
}

async function resolveDueDate(m: Record<string, any>): Promise<{ date: string } | null> {
  const date = dueDateForMandate(m);
  return date ? { date } : null;
}

/**
 * Book the internal leg for a Target Ajo collection. Called ONLY after VFD has
 * confirmed the debit with status "00".
 */
async function postTargetAjoContribution(
  m: Record<string, any>,
  amount: number,
): Promise<boolean> {
  const supabase = db();
  try {
    const { error: insErr } = await supabase.from("vfd_sandbox_target_contributions").insert({
      target_id: m.product_reference,
      user_id: m.user_id,
      amount,
      status: "completed",
    });
    if (insErr) throw insErr;

    const { data: member } = await supabase.from("vfd_sandbox_target_members")
      .select("id, contributed_amount")
      .eq("target_id", m.product_reference).eq("user_id", m.user_id).maybeSingle();
    if (member) {
      await supabase.from("vfd_sandbox_target_members")
        .update({ contributed_amount: Number(member.contributed_amount || 0) + amount })
        .eq("id", member.id);
    }

    const { data: target } = await supabase.from("vfd_sandbox_targets")
      .select("id, total_contributed").eq("id", m.product_reference).maybeSingle();
    if (target) {
      await supabase.from("vfd_sandbox_targets")
        .update({ total_contributed: Number(target.total_contributed || 0) + amount })
        .eq("id", target.id);
    }
    return true;
  } catch (e) {
    console.error("[mandate-engine] target ajo ledger post failed", e);
    return false;
  }
}

async function handleRunDueDebits(limit: number) {
  const supabase = db();
  // Only the products this engine OWNS are collected here. thrift is collected
  // by the cycle sweep and fd_investment by goalsave-debit-worker — both call
  // the same shared `collectMandateDebit`, so running them here too would only
  // create a second scheduling path for the same money.
  const { data: mandates } = await supabase.from("mandates")
    .select("*").eq("status", "bank_approved").eq("product_type", "target_ajo")
    .order("created_at", { ascending: true }).limit(limit);

  const results: Array<Record<string, unknown>> = [];

  for (const m of mandates || []) {
    const due = await resolveDueDate(m);
    if (!due) { results.push({ mandate_id: m.id, outcome: "not_due" }); continue; }

    // ONE shared collection path: atomic attempt claim + real VFD ACCOUNT DEBIT.
    const collection = await collectMandateDebit({
      db: supabase,
      mandateId: m.id as string,
      mandateReference: m.mandate_reference as string,
      amount: Number(m.amount),
      purpose: "Vestara Target Ajo contribution",
      productRef: m.product_reference as string,
      scheduledDate: due.date,
    });

    if (collection.skipped) {
      results.push({ mandate_id: m.id, outcome: "skipped", reason: collection.reason });
      continue;
    }

    await logEvent(m.id, m.user_id, m.mandate_reference, "debit_attempted", {
      attempt_id: collection.attemptId, scheduled_date: due.date, amount: Number(m.amount),
    });

    if (!collection.collected) {
      if (collection.failureClass === "mandate_revoked") {
        await supabase.from("mandates").update({
          status: "revoked", resolved_at: new Date().toISOString(), rejection_reason: collection.reason,
        }).eq("id", m.id);
        await markProductFailed(m, collection.reason || "Mandate revoked");
      }

      await logEvent(m.id, m.user_id, m.mandate_reference, "debit_failed", {
        attempt_id: collection.attemptId, scheduled_date: due.date,
        failure_class: collection.failureClass, reason: collection.reason, vfd: collection.raw,
      });

      if (collection.failureClass === "insufficient_funds") {
        await notify(m.user_id as string, "Contribution could not be collected",
          `Your bank declined today's NGN ${Number(m.amount).toLocaleString()} contribution for insufficient funds. Fund the account before the next scheduled date.`,
          "mandate_debit_failed");
      } else if (collection.failureClass === "mandate_revoked") {
        await notify(m.user_id as string, "Direct Debit Mandate is no longer active",
          "Your bank reports the mandate as revoked or inactive. Set up a new mandate to resume automatic contributions.",
          "mandate_revoked");
      }

      results.push({ mandate_id: m.id, outcome: "failed", failure_class: collection.failureClass });
      continue;
    }

    // CONFIRMED by VFD (status "00") — only now does the ledger move.
    const txRef = `vestara-ddm-debit-${m.id}-${due.date}`;
    const ledgerPosted = await postTargetAjoContribution(m, Number(m.amount));
    await markAttemptLedgerPosted(supabase, collection.attemptId, ledgerPosted ? txRef : null, ledgerPosted);

    await logEvent(m.id, m.user_id, m.mandate_reference, "debit_succeeded", {
      attempt_id: collection.attemptId, scheduled_date: due.date, amount: Number(m.amount),
      transaction_reference: txRef, ledger_posted: ledgerPosted,
    });

    await notify(m.user_id as string, "Contribution collected",
      `NGN ${Number(m.amount).toLocaleString()} was debited from your bank account for your Target Ajo group.`,
      "mandate_debit_succeeded");

    results.push({ mandate_id: m.id, outcome: "succeeded", ledger_posted: ledgerPosted });
  }

  return json({ data: { considered: (mandates || []).length, results } });
}

// ---------------------------------------------------------------------------
// Go-live configuration assertion (read-only)
// ---------------------------------------------------------------------------
function handleGoLiveCheck() {
  const productionEndpoints = VFD_MANDATE_BASE.startsWith("https://api-apps.vfdbank.systems");
  return json({
    data: {
      vfd_mode: VFD_IS_PRODUCTION ? "production" : "sandbox",
      mandate_base: VFD_MANDATE_BASE,
      production_endpoints: productionEndpoints,
      mandate_test_mode: MANDATE_TEST_MODE,
      receiver_pool_nuban: VFD_POOL_NUBAN,
      go_live_ready: VFD_IS_PRODUCTION && productionEndpoints && !MANDATE_TEST_MODE,
    },
  });
}

/**
 * Ops-only live probe: fires a REAL e-mandate creation at VFD for the given
 * payer and returns VFD's raw answer plus the token source that authenticated.
 * Creates no ledger rows and charges no fee — mandate creation itself moves no
 * money (the payer only pays NIBSS ₦50 when they approve).
 */
async function handleLiveProbe(body: Record<string, unknown>): Promise<Response> {
  const product = String(body.product || "goal_savings");
  const payer: MandatePayer = {
    bankCode: String(body.payer_bank_code || "999999"),
    accountNumber: String(body.payer_account_number || ""),
    phone: String(body.payer_phone || ""),
    email: String(body.payer_email || ""),
    address: String(body.payer_address || "Lagos, Nigeria"),
  };
  if (!/^\d{10}$/.test(payer.accountNumber)) {
    return json({ error: "payer_account_number must be 10 digits" }, 400);
  }
  const frequency = mapFrequencyToVfd(String(body.frequency || "monthly"));
  const startDate = new Date();
  const endDate = addCycles(startDate, frequency, 13);
  const reference = `vestara-probe-${product}-${Date.now()}`;
  const amount = Math.max(MANDATE_MIN_AMOUNT, Number(body.amount) || MANDATE_MIN_AMOUNT);

  const vfd = await createMandate({ reference, payer, amount, frequency, startDate, endDate });

  // When VFD rejects the token, replay the identical payload with every
  // credential pair so ops can see exactly which one is entitled.
  let tokenSources: Array<Record<string, unknown>> | undefined;
  if (!vfd.created && body.compare_tokens !== false) {
    const req = (vfd.raw as Record<string, unknown>).request as Record<string, unknown> | undefined;
    tokenSources = await probeMandateTokenSources(req ?? { reference });
  }

  return json({
    product,
    reference,
    token_source: getLastMandateTokenSource(),
    mandate_base: VFD_MANDATE_BASE,
    receiver_account: VFD_POOL_NUBAN,
    created: vfd.created,
    mandate_code: vfd.mandateCode,
    nibss_account: vfd.nibssAccount,
    nibss_message: vfd.nibssMessage,
    raw: vfd.raw,
    token_sources: tokenSources,
  });
}


/**
 * Ops-only: replay the EXACT e-mandate creation payload using ONLY a caller
 * supplied AccessToken, bypassing all stored credential discovery. Used to test
 * a token minted manually in the VFD BaaS dashboard. Token is never persisted
 * or logged.
 */
async function handleRawTokenProbe(body: Record<string, unknown>): Promise<Response> {
  const token = String(body.access_token || "");
  if (!token) return json({ error: "access_token required" }, 400);

  const payer: MandatePayer = {
    bankCode: String(body.payer_bank_code || "999999"),
    accountNumber: String(body.payer_account_number || ""),
    phone: String(body.payer_phone || ""),
    email: String(body.payer_email || ""),
    address: String(body.payer_address || "Lagos, Nigeria"),
  };
  if (!/^\d{10}$/.test(payer.accountNumber)) {
    return json({ error: "payer_account_number must be 10 digits" }, 400);
  }
  const frequency = mapFrequencyToVfd(String(body.frequency || "monthly"));
  const startDate = new Date();
  const endDate = addCycles(startDate, frequency, 13);
  const payload = {
    reference: `vestara-rawtok-${Date.now()}`,
    payerBank: payer.bankCode,
    payerAccountNumber: payer.accountNumber,
    payerPhone: payer.phone,
    payerEmailAddress: payer.email,
    payerAddress: payer.address,
    receiverBank: String(body.receiver_bank_code || "999999"),
    receiverAccountNumber: String(body.receiver_account_number || VFD_POOL_NUBAN),
    amount: String(Math.max(MANDATE_MIN_AMOUNT, Number(body.amount) || MANDATE_MIN_AMOUNT)),
    startDate: formatVfdMandateDate(startDate),
    endDate: formatVfdMandateDate(endDate),
    frequency,
  };

  const url = `${VFD_MANDATE_BASE}${VFD_MANDATE_CREATE_PATH}`;
  const res = await vfdFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", AccessToken: token },
    body: JSON.stringify(payload),
  });
  const json_body = await res.json().catch(() => ({}));
  return json({
    endpoint: url,
    request: payload,
    http_status: res.status,
    response: json_body,
  });
}

/**
 * Ops-only: isolate WHY VFD's e-mandate endpoint answers "Invalid wallet
 * token". Mints a token with the mandate consumer pair, then replays the same
 * minimal setup payload across auth-header names and documented base paths.
 * Returns VFD's verbatim status/message per combination; never the token.
 */
async function handleHeaderVariantProbe(body: Record<string, unknown>): Promise<Response> {
  const host = VFD_MANDATE_BASE.replace(/\/vtech-mandate.*$/, "");
  const consumerKey = Deno.env.get("VFD_MANDATE_CONSUMER_KEY_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_KEY") || "";
  const consumerSecret = Deno.env.get("VFD_MANDATE_CONSUMER_SECRET_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_SECRET") || "";
  let token = "";
  try {
    const tRes = await vfdFetch(`${host}/vfd-tech/baas-portal/v1.1/baasauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "1" }),
    });
    const tJson = await tRes.json().catch(() => ({} as Record<string, any>));
    token = String(tJson?.data?.access_token || tJson?.data?.accessToken || tJson?.access_token || "");
  } catch (e) {
    return json({ error: "token mint failed", detail: e instanceof Error ? e.message : String(e) }, 502);
  }
  if (!token) return json({ error: "no token minted" }, 502);

  const startDate = new Date();
  const payload = {
    reference: `vestara-hdr-${Date.now()}`,
    payerBank: String(body.payer_bank_code || "999999"),
    payerAccountNumber: String(body.payer_account_number || "1049299737"),
    payerPhone: String(body.payer_phone || "08100000000"),
    payerEmailAddress: String(body.payer_email || "ops@vestara.ng"),
    payerAddress: "Lagos, Nigeria",
    receiverBank: "999999",
    receiverAccountNumber: VFD_POOL_NUBAN,
    amount: String(MANDATE_MIN_AMOUNT),
    startDate: formatVfdMandateDate(startDate),
    endDate: formatVfdMandateDate(addCycles(startDate, "3", 13)),
    frequency: "3",
  };

  const paths = Array.isArray(body.paths) && body.paths.length
    ? (body.paths as string[]).map(String)
    : [
      "/vtech-mandate/api/v2/directdebit/mandate/setup?e-mandate=true",
      "/vtech-mandate/api/v1/directdebit/mandate/setup?e-mandate=true",
      "/vtech-mandate/api/v2/directdebit/mandate/setup",
    ];
  const extra = (body.extra && typeof body.extra === "object") ? body.extra as Record<string, unknown> : {};
  const methods = Array.isArray(body.methods) && body.methods.length ? (body.methods as string[]).map(String) : ["POST"];
  const headerSets: Array<{ name: string; headers: Record<string, string> }> =
    body.single_header === true
      ? [{ name: "AccessToken", headers: { AccessToken: token } }]
      : [
        { name: "AccessToken", headers: { AccessToken: token } },
        { name: "Authorization_Bearer", headers: { Authorization: `Bearer ${token}` } },
        { name: "accesstoken_lower", headers: { accesstoken: token } },
        { name: "AccessToken_plus_Bearer", headers: { AccessToken: token, Authorization: `Bearer ${token}` } },
      ];

  const results: Array<Record<string, unknown>> = [];
  for (const p of paths) {
    for (const h of headerSets) {
      for (const m of methods) {
        try {
          const init: RequestInit = {
            method: m,
            headers: { "Content-Type": "application/json", ...h.headers },
          };
          if (m !== "GET") {
            init.body = JSON.stringify({ ...payload, ...extra, reference: `${payload.reference}-${results.length}` });
          }
          const res = await vfdFetch(`${host}${p}`, init);
          const raw = await res.text();
          let rb: unknown = raw;
          try { rb = JSON.parse(raw); } catch { /* keep text */ }
          results.push({ path: p, method: m, auth_header: h.name, http_status: res.status, response: rb });
        } catch (e) {
          results.push({ path: p, method: m, auth_header: h.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  }
  return json({ host, token_minted: true, request_shape: payload, results });
}



// Diagnostic: compare wallet vs mandate consumer credentials WITHOUT revealing
// them. Returns short SHA-256 fingerprints and equality flags only.
async function fp(v: string | undefined): Promise<string | null> {
  if (!v) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

async function handleCredentialFingerprint() {
  const wk = Deno.env.get("VFD_CONSUMER_KEY");
  const ws = Deno.env.get("VFD_CONSUMER_SECRET");
  const mk = (Deno.env.get("VFD_MANDATE_CONSUMER_KEY_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_KEY"));
  const ms = (Deno.env.get("VFD_MANDATE_CONSUMER_SECRET_V2") || Deno.env.get("VFD_MANDATE_CONSUMER_SECRET"));
  return json({
    wallet_key: { set: !!wk, len: wk?.length ?? 0, fp: await fp(wk) },
    wallet_secret: { set: !!ws, len: ws?.length ?? 0, fp: await fp(ws) },
    mandate_key: { set: !!mk, len: mk?.length ?? 0, fp: await fp(mk) },
    mandate_secret: { set: !!ms, len: ms?.length ?? 0, fp: await fp(ms) },
    key_pairs_identical: !!wk && !!mk && wk === mk,
    secret_pairs_identical: !!ws && !!ms && ws === ms,
    vfd_mode: Deno.env.get("VFD_MODE") || null,
  });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: Record<string, unknown> = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || "");

    // Cron / service-to-service actions. Never client-triggered.
    const CRON_ACTIONS = new Set(["poll_pending", "run_due_debits", "go_live_check", "live_probe", "raw_token_probe", "header_variant_probe", "credential_fingerprint", "credential_mint_probe"]);
    if (CRON_ACTIONS.has(action)) {
      if (!(await verifyCronToken(req, CRON_TOKEN_NAME))) {
        return json({ error: "Unauthorized" }, 401);
      }
      const limit = Math.min(Number(body.limit ?? 200) || 200, 500);
      if (action === "credential_mint_probe") return json({ data: await probeCredentialMint() });
      if (action === "credential_fingerprint") return await handleCredentialFingerprint();
      if (action === "poll_pending") return await handlePollPending(limit);
      if (action === "run_due_debits") return await handleRunDueDebits(limit);
      if (action === "live_probe") return await handleLiveProbe(body);
      if (action === "raw_token_probe") return await handleRawTokenProbe(body);
      if (action === "header_variant_probe") return await handleHeaderVariantProbe(body);
      return handleGoLiveCheck();
    }

    if (action === "create_mandate") {
      const userId = await requireUser(req);
      if (!userId) return json({ error: "Unauthorized" }, 401);
      return await handleCreateMandate(userId, body);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[mandate-engine] unhandled", e);
    return json({ error: "Mandate service error" }, 500);
  }
});
