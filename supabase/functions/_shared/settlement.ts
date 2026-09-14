// Settlement integrity layer.
//
// CORE RULE: an internal Vestara ledger entry is NEVER proof that money moved.
// Every real bank leg (DDM collection into the corporate pool, investment
// funding into a product sub-account, thrift payout out of the pool) opens a
// `settlement_records` row FIRST, and downstream internal postings are only
// allowed once that row reaches status = 'confirmed' — i.e. VFD itself has
// independently confirmed the movement (TSQ / statement evidence).
//
// Statuses:
//   pending      — bank leg attempted, confirmation not yet obtained
//   confirmed    — VFD independently confirmed the money moved
//   failed       — VFD confirmed the leg did not happen
//   unreconciled — repeated confirmation attempts inconclusive; needs a human

// deno-lint-ignore no-explicit-any
type Db = any;

export type SettlementDirection = "in" | "out";
export type SettlementStatus = "pending" | "confirmed" | "failed" | "unreconciled";

export interface SettlementRecord {
  id: string;
  status: SettlementStatus;
  provider_reference: string;
  amount: number;
  ledger_posted: boolean;
}

export interface OpenSettlementParams {
  productType: string;
  productReference: string;
  userId?: string | null;
  direction: SettlementDirection;
  amount: number;
  sourceAccount?: string | null;
  destinationAccount?: string | null;
  providerReference: string;
  metadata?: Record<string, unknown>;
}

/**
 * Idempotently open (or fetch) the settlement record for a bank leg.
 * Must be called BEFORE/at the moment the outbound call is made so a crash
 * mid-flight still leaves a traceable, reconcilable breadcrumb.
 */
export async function openSettlement(db: Db, p: OpenSettlementParams): Promise<SettlementRecord | null> {
  const row = {
    product_type: p.productType,
    product_reference: p.productReference,
    user_id: p.userId || null,
    direction: p.direction,
    amount: Number(p.amount),
    source_account: p.sourceAccount || null,
    destination_account: p.destinationAccount || null,
    provider: "vfd",
    provider_reference: p.providerReference,
    metadata: p.metadata || {},
  };
  const { data, error } = await db.from("settlement_records")
    .upsert(row, { onConflict: "provider,provider_reference", ignoreDuplicates: true })
    .select("id, status, provider_reference, amount, ledger_posted")
    .maybeSingle();
  if (!error && data) return data as SettlementRecord;
  // Duplicate (already open) or a transient write error — read the canonical row.
  const { data: existing } = await db.from("settlement_records")
    .select("id, status, provider_reference, amount, ledger_posted")
    .eq("provider", "vfd").eq("provider_reference", p.providerReference)
    .maybeSingle();
  if (!existing && error) console.error("[settlement] open failed", error);
  return (existing as SettlementRecord) || null;
}

/** Record the outcome of a confirmation attempt against a settlement leg. */
export async function markSettlement(
  db: Db,
  providerReference: string,
  status: SettlementStatus,
  opts: { evidence?: unknown; sessionId?: string | null; bumpAttempt?: boolean } = {},
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    last_checked_at: new Date().toISOString(),
    evidence: (opts.evidence as Record<string, unknown>) ?? {},
  };
  if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
  if (opts.sessionId) patch.provider_session_id = opts.sessionId;
  if (opts.bumpAttempt) {
    const { data } = await db.from("settlement_records")
      .select("attempts").eq("provider", "vfd").eq("provider_reference", providerReference).maybeSingle();
    patch.attempts = Number(data?.attempts || 0) + 1;
  }
  const { error } = await db.from("settlement_records").update(patch)
    .eq("provider", "vfd").eq("provider_reference", providerReference);
  if (error) console.error("[settlement] mark failed", providerReference, error.message);
}

/** Flag that the internal double-entry posting for a confirmed leg is done. */
export async function markSettlementLedgerPosted(
  db: Db, providerReference: string, ledgerReference: string,
): Promise<void> {
  await db.from("settlement_records")
    .update({ ledger_posted: true, ledger_reference: ledgerReference })
    .eq("provider", "vfd").eq("provider_reference", providerReference);
}

/** True only when VFD has independently confirmed this leg. */
export async function isSettlementConfirmed(db: Db, providerReference: string): Promise<boolean> {
  const { data } = await db.from("settlement_records")
    .select("status").eq("provider", "vfd").eq("provider_reference", providerReference).maybeSingle();
  return data?.status === "confirmed";
}

/**
 * Are ALL money-in legs for a product reference confirmed?
 * Used as the payout gate: a thrift cycle cannot disburse while any member's
 * collection is still pending or unreconciled at the bank.
 */
export async function allInboundConfirmed(
  db: Db, productType: string, productReference: string, cycleTag?: string,
): Promise<{ ok: boolean; pending: Array<{ reference: string; status: string; user_id: string | null }> }> {
  let q = db.from("settlement_records")
    .select("provider_reference, status, user_id, metadata")
    .eq("product_type", productType)
    .eq("product_reference", productReference)
    .eq("direction", "in")
    // A definitively failed bank leg moved no money and cannot hold a cycle.
    // Positive per-member funding proof is checked separately before payout.
    .in("status", ["pending", "unreconciled"]);
  const { data } = await q;
  let rows = (data || []) as Array<Record<string, unknown>>;
  if (cycleTag) {
    rows = rows.filter((r) => String((r.metadata as Record<string, unknown>)?.cycle_tag || "") === cycleTag);
  }
  return {
    ok: rows.length === 0,
    pending: rows.map((r) => ({
      reference: String(r.provider_reference),
      status: String(r.status),
      user_id: (r.user_id as string) || null,
    })),
  };
}
