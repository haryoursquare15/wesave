// Pool -> product sub-account sweep.
//
// RULE: money collected by a Direct Debit Mandate always lands in the Vestara
// CORPORATE POOL first (that is the only account VFD credits on /account/debit).
// It must not stay there. Immediately after a collection is confirmed, the same
// amount is swept out of the pool into the product's dedicated VFD sub-account
// (Goal Savings 1048523721, Vault 1048523714, LockMax 1048523745, Upfront Yield
// 1048523738) so the sub-account balance always mirrors customer holdings.
//
// The sweep is:
//   * deterministic       — reference SWEEP-<PRODUCT>-<contract>-<seq>
//   * idempotent          — a replay hits VFD's duplicate-reference guard and is
//                           resolved via TSQ, never double-moving money
//   * settlement-anchored — a settlement_records row is opened BEFORE the call
//                           and only reaches `confirmed` on independent TSQ proof
import { vfdFetch, getGatewayAccessToken } from "./vfd-gateway.ts";
import { openSettlement, markSettlement } from "./settlement.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const WALLET_BASE_TEST = "https://api-devapps.vfdbank.systems/vtech-wallet/api/v2/wallet2";
const WALLET_BASE_LIVE = "https://api-apps.vfdbank.systems/vtech-wallet/api/v2/wallet2";

function walletBase(): string {
  const mode = (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase();
  return mode === "production" || mode === "live" ? WALLET_BASE_LIVE : WALLET_BASE_TEST;
}

export const VFD_CORPORATE_POOL_NUBAN =
  Deno.env.get("VFD_CORPORATE_POOL_NUBAN") || "1047279595";

async function safeJson(resp: Response): Promise<Record<string, unknown>> {
  try {
    const raw = await resp.text();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function walletRequest(
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  query?: Record<string, string>,
): Promise<{ data: Record<string, unknown>; status: number }> {
  const token = await getGatewayAccessToken();
  if (!token) return { data: { error: "VFD auth failed" }, status: 401 };
  const url = new URL(`${walletBase()}${endpoint}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const resp = await vfdFetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/json", AccessToken: token },
    body: body && method === "POST" ? JSON.stringify(body) : undefined,
  });
  return { data: await safeJson(resp), status: resp.status };
}

async function transferSignature(from: string, to: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(`${from}${to}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTransfer(reference: string): Promise<{ confirmed: boolean; evidence: unknown }> {
  try {
    const { data } = await walletRequest("/transactions", "GET", undefined, { reference });
    const inner = (data?.data as Record<string, unknown>) ?? {};
    const txStatus = String(inner?.transactionStatus ?? inner?.status ?? data?.status ?? "").trim();
    const txMessage = String(inner?.transactionStatusMessage ?? data?.message ?? "");
    return {
      confirmed: txStatus === "00" && !/pending|fail|revers/i.test(txMessage),
      evidence: data,
    };
  } catch (e) {
    return { confirmed: false, evidence: { error: e instanceof Error ? e.message : String(e) } };
  }
}

const firstNonEmpty = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = v === undefined || v === null ? "" : String(v).trim();
    if (s) return s;
  }
  return "";
};

export interface PoolSweepResult {
  confirmed: boolean;
  reference: string;
  subAccountNuban?: string | null;
  code?: string;
  error?: string;
  evidence?: unknown;
  replayed?: boolean;
}

export interface PoolSweepParams {
  db: Db;
  productCode: string;      // e.g. "goalsave"
  savingsId: string;        // contract id
  userId?: string | null;
  amount: number;
  seq: number | string;     // installment sequence (or a stable leg tag)
  remark?: string;
}

/**
 * Sweep an amount that has just landed in the corporate pool into the product's
 * dedicated VFD sub-account. Safe to call repeatedly for the same (contract, seq).
 */
export async function sweepPoolToProductSubaccount(p: PoolSweepParams): Promise<PoolSweepResult> {
  const db = p.db;
  const amount = Number(p.amount);
  const productCode = String(p.productCode).toLowerCase();
  const reference = `SWEEP-${productCode.toUpperCase()}-${p.savingsId.replace(/-/g, "").slice(0, 16)}-${p.seq}`;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { confirmed: false, reference, code: "SWEEP_INVALID_AMOUNT", error: "Invalid sweep amount" };
  }

  // Already settled? (crash-safe replay)
  const { data: existing } = await db.from("settlement_records")
    .select("status").eq("provider", "vfd").eq("provider_reference", reference).maybeSingle();
  if (existing?.status === "confirmed") {
    return { confirmed: true, reference, replayed: true };
  }

  const { data: product } = await db.from("vestara_products")
    .select("code, name, sub_account_nuban").eq("code", productCode).maybeSingle();
  const subAccountNuban = (product?.sub_account_nuban as string | null) || null;
  if (!subAccountNuban) {
    return {
      confirmed: false, reference, code: "SUBACCOUNT_NOT_CONFIGURED",
      error: `Product "${productCode}" has no sub-account NUBAN configured.`,
    };
  }
  if (subAccountNuban === VFD_CORPORATE_POOL_NUBAN) {
    return { confirmed: false, reference, code: "SELF_TRANSFER_BLOCKED", error: "Sub-account equals the pool account." };
  }

  // A prior in-flight attempt may already have settled at VFD.
  const prior = await verifyTransfer(reference);
  if (prior.confirmed) {
    await openSettlement(db, {
      productType: `${productCode}_subaccount_sweep`,
      productReference: p.savingsId,
      userId: p.userId || null,
      direction: "out",
      amount,
      sourceAccount: VFD_CORPORATE_POOL_NUBAN,
      destinationAccount: subAccountNuban,
      providerReference: reference,
      metadata: { seq: p.seq, product_code: productCode },
    });
    await markSettlement(db, reference, "confirmed", { evidence: prior.evidence });
    return { confirmed: true, reference, subAccountNuban, evidence: prior.evidence, replayed: true };
  }

  await openSettlement(db, {
    productType: `${productCode}_subaccount_sweep`,
    productReference: p.savingsId,
    userId: p.userId || null,
    direction: "out",
    amount,
    sourceAccount: VFD_CORPORATE_POOL_NUBAN,
    destinationAccount: subAccountNuban,
    providerReference: reference,
    metadata: { seq: p.seq, product_code: productCode, remark: p.remark || null },
  });

  const { data: poolEnq, status: poolStatus } = await walletRequest(
    "/account/enquiry", "GET", undefined, { accountNumber: VFD_CORPORATE_POOL_NUBAN },
  );
  if (poolStatus !== 200 || poolEnq?.status !== "00") {
    await markSettlement(db, reference, "pending", { evidence: poolEnq, bumpAttempt: true });
    return { confirmed: false, reference, subAccountNuban, code: "SWEEP_SOURCE_ENQUIRY_FAILED", error: "Pool account unreachable", evidence: poolEnq };
  }

  const { data: subEnq, status: subStatus } = await walletRequest(
    "/account/enquiry", "GET", undefined, { accountNumber: subAccountNuban },
  );
  if (subStatus !== 200 || subEnq?.status !== "00") {
    await markSettlement(db, reference, "pending", { evidence: subEnq, bumpAttempt: true });
    return { confirmed: false, reference, subAccountNuban, code: "SWEEP_DEST_ENQUIRY_FAILED", error: "Product sub-account unreachable", evidence: subEnq };
  }

  const pEnv = (poolEnq?.data as Record<string, unknown>) || {};
  const pAcct = (pEnv?.account as Record<string, unknown>) || pEnv;
  const sEnv = (subEnq?.data as Record<string, unknown>) || {};
  const sAcct = (sEnv?.account as Record<string, unknown>) || sEnv;

  const payload = {
    fromAccount: VFD_CORPORATE_POOL_NUBAN,
    fromClientId: firstNonEmpty(Deno.env.get("VFD_POOL_CLIENT_ID"), pEnv?.clientId, pAcct?.clientId),
    fromClient: firstNonEmpty(Deno.env.get("VFD_POOL_CLIENT_NAME"), pEnv?.client, pAcct?.client, pEnv?.name),
    fromSavingsId: firstNonEmpty(Deno.env.get("VFD_POOL_SAVINGS_ID"), pAcct?.id, pEnv?.accountId, pEnv?.id),
    fromBvn: String(pEnv?.bvn ?? ""),
    toAccount: subAccountNuban,
    toBank: "999999",
    toClient: firstNonEmpty(sEnv?.client, sAcct?.client, product?.name, "Vestara Product Pool"),
    toClientId: firstNonEmpty(sEnv?.clientId, sAcct?.clientId),
    toSavingsId: firstNonEmpty(sAcct?.id, sEnv?.accountId, sEnv?.id),
    toSession: "",
    toBvn: String(sEnv?.bvn ?? ""),
    signature: await transferSignature(VFD_CORPORATE_POOL_NUBAN, subAccountNuban),
    amount: String(amount),
    remark: (p.remark || `${product?.name || productCode} funding`).slice(0, 60),
    transferType: "intra",
    reference,
  };

  if (!payload.fromClientId || !payload.fromSavingsId || !payload.toSavingsId || !payload.toClientId) {
    await markSettlement(db, reference, "pending", { evidence: { poolEnq, subEnq }, bumpAttempt: true });
    return { confirmed: false, reference, subAccountNuban, code: "SWEEP_IDENTITY_MISSING", error: "Sweep identities incomplete" };
  }

  console.log(`[sweep][pool->${productCode}] ${JSON.stringify(payload)}`);
  const { data: transferResp } = await walletRequest("/transfer", "POST", payload);
  const vfdMessage = String(transferResp?.message ?? "");
  const duplicate = String(transferResp?.status ?? "") === "98" || /reference exist/i.test(vfdMessage);

  const verified = await verifyTransfer(reference);
  if (!verified.confirmed) {
    await markSettlement(db, reference, "pending", { evidence: { transfer: transferResp, tsq: verified.evidence }, bumpAttempt: true });
    return {
      confirmed: false, reference, subAccountNuban,
      code: duplicate ? "SWEEP_UNCONFIRMED" : "SWEEP_FAILED",
      error: vfdMessage || "Sub-account sweep not confirmed at the bank",
      evidence: { transfer: transferResp, tsq: verified.evidence },
    };
  }

  await markSettlement(db, reference, "confirmed", { evidence: verified.evidence });
  return { confirmed: true, reference, subAccountNuban, evidence: verified.evidence, replayed: duplicate };
}
