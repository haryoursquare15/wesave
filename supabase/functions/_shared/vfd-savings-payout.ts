// Savings payout bank leg: product sub-account (or corporate pool) -> customer NUBAN.
//
// CORE RULE (non-negotiable): a maturity / early-withdrawal ledger credit is NOT
// money. Real cash must leave the product sub-account (or, when the sub-account
// sweep never completed, the corporate pool) and land on the customer's own VFD
// NUBAN BEFORE any internal wallet credit is posted.
//
// The leg is:
//   * deterministic       — reference PAYOUT-<PRODUCT>-<contract16>-<seq>
//   * idempotent          — replays hit VFD's duplicate guard and resolve via TSQ
//   * settlement-anchored — settlement_records opened before the call, confirmed
//                           only on independent TSQ proof
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

function readBalance(enq: Record<string, unknown>): number {
  const env = (enq?.data as Record<string, unknown>) || {};
  const acct = (env?.account as Record<string, unknown>) || env;
  const raw = firstNonEmpty(acct?.accountBalance, env?.accountBalance, acct?.availableBalance, env?.availableBalance);
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface SavingsPayoutResult {
  confirmed: boolean;
  reference: string;
  sourceAccount?: string | null;
  destinationAccount?: string | null;
  code?: string;
  error?: string;
  evidence?: unknown;
  replayed?: boolean;
}

export interface SavingsPayoutParams {
  db: Db;
  productCode: string;
  savingsId: string;
  userId: string;
  amount: number;
  seq?: string;            // leg tag: "maturity" | "early" | recovery tag
  remark?: string;
}

/**
 * Move a savings payout out of the product sub-account (falling back to the
 * corporate pool when the sub-account was never funded) into the customer's
 * own NUBAN. Safe to call repeatedly for the same (contract, seq).
 */
export async function payoutSavingsToUser(p: SavingsPayoutParams): Promise<SavingsPayoutResult> {
  const db = p.db;
  const amount = Number(p.amount);
  const productCode = String(p.productCode || "").toLowerCase();
  const seq = p.seq || "payout";
  const reference = `PAYOUT-${productCode.toUpperCase()}-${p.savingsId.replace(/-/g, "").slice(0, 16)}-${seq}`;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { confirmed: false, reference, code: "PAYOUT_INVALID_AMOUNT", error: "Invalid payout amount" };
  }

  // Crash-safe replay: already proven settled.
  const { data: existing } = await db.from("settlement_records")
    .select("status").eq("provider", "vfd").eq("provider_reference", reference).maybeSingle();
  if (existing?.status === "confirmed") return { confirmed: true, reference, replayed: true };

  // Destination — the customer's own VFD NUBAN.
  const { data: client } = await db.from("vfd_sandbox_clients")
    .select("vfd_account_number, vfd_client_id, full_name, bvn")
    .eq("user_id", p.userId).maybeSingle();

  const destination = (client?.vfd_account_number as string | null) || null;
  if (!destination) {
    return { confirmed: false, reference, code: "PAYOUT_NO_CUSTOMER_NUBAN", error: "Customer has no bank account yet" };
  }

  const { data: product } = await db.from("vestara_products")
    .select("code, name, sub_account_nuban").eq("code", productCode).maybeSingle();
  const subAccount = (product?.sub_account_nuban as string | null) || null;

  // A prior in-flight attempt may already have settled at VFD.
  const prior = await verifyTransfer(reference);
  const openLeg = (source: string) => openSettlement(db, {
    productType: `${productCode}_savings_payout`,
    productReference: p.savingsId,
    userId: p.userId,
    direction: "out",
    amount,
    sourceAccount: source,
    destinationAccount: destination,
    providerReference: reference,
    metadata: { seq, product_code: productCode, remark: p.remark || null },
  });

  if (prior.confirmed) {
    await openLeg(subAccount || VFD_CORPORATE_POOL_NUBAN);
    await markSettlement(db, reference, "confirmed", { evidence: prior.evidence });
    return { confirmed: true, reference, destinationAccount: destination, evidence: prior.evidence, replayed: true };
  }

  // Pick the funding source: the product sub-account when it actually holds the
  // money, otherwise the corporate pool (where un-swept collections still sit).
  let source = VFD_CORPORATE_POOL_NUBAN;
  let srcEnq: Record<string, unknown> | null = null;

  if (subAccount && subAccount !== VFD_CORPORATE_POOL_NUBAN) {
    const { data: enq, status } = await walletRequest("/account/enquiry", "GET", undefined, { accountNumber: subAccount });
    if (status === 200 && enq?.status === "00" && readBalance(enq) >= amount) {
      source = subAccount;
      srcEnq = enq;
    }
  }
  if (!srcEnq) {
    const { data: enq, status } = await walletRequest("/account/enquiry", "GET", undefined, { accountNumber: VFD_CORPORATE_POOL_NUBAN });
    await openLeg(VFD_CORPORATE_POOL_NUBAN);
    if (status === 200 && enq?.status === "00") {
      if (readBalance(enq) < amount) {
        await markSettlement(db, reference, "pending", { evidence: enq, bumpAttempt: true });
        return { confirmed: false, reference, sourceAccount: source, destinationAccount: destination, code: "PAYOUT_INSUFFICIENT_SOURCE", error: "Not enough settled cash to release this payout", evidence: enq };
      }
      srcEnq = enq;
    } else {
      // The credential-scoped enquiry does not always see the corporate pool.
      // Resolve its identity through the intra-bank name enquiry instead; the
      // bank still rejects the transfer if the pool is short, and nothing is
      // credited internally until TSQ confirms the movement.
      const { data: rec, status: recStatus } = await walletRequest(
        "/transfer/recipient", "GET", undefined,
        { accountNo: VFD_CORPORATE_POOL_NUBAN, bank: "999999", transfer_type: "intra" },
      );
      if (recStatus === 200 && rec?.status === "00") {
        const d = (rec.data as Record<string, unknown>) || {};
        const acct = (d.account as Record<string, unknown>) || {};
        srcEnq = { data: { clientId: d?.clientId, client: d?.name, bvn: d?.bvn, account: { id: acct?.id } } } as Record<string, unknown>;
      } else {
        await markSettlement(db, reference, "pending", { evidence: { enquiry: enq, recipient: rec }, bumpAttempt: true });
        return { confirmed: false, reference, sourceAccount: source, destinationAccount: destination, code: "PAYOUT_SOURCE_ENQUIRY_FAILED", error: "Funding account unreachable", evidence: { enquiry: enq, recipient: rec } };
      }
    }
  } else {
    await openLeg(source);
  }


  // Destination identity: the credential-scoped /account/enquiry only sees our
  // own wallet accounts, so resolve the customer through the intra-bank name
  // enquiry first (works for any VFD account) and fall back to enquiry.
  let dClientId = "", dSavingsId = "", dClientName = "", dBvn = "";
  const { data: rec, status: recStatus } = await walletRequest(
    "/transfer/recipient", "GET", undefined,
    { accountNo: destination, bank: "999999", transfer_type: "intra" },
  );
  if (recStatus === 200 && rec?.status === "00") {
    const d = (rec.data as Record<string, unknown>) || {};
    const acct = (d.account as Record<string, unknown>) || {};
    dSavingsId = String(acct?.id ?? "");
    dClientId = String(d?.clientId ?? "");
    dClientName = String(d?.name ?? "");
    dBvn = String(d?.bvn ?? "");
  }
  let destEnq: Record<string, unknown> | null = null;
  if (!dClientId || !dSavingsId) {
    const { data: enq, status: destStatus } = await walletRequest("/account/enquiry", "GET", undefined, { accountNumber: destination });
    destEnq = enq;
    if (destStatus === 200 && enq?.status === "00") {
      const dEnv = (enq?.data as Record<string, unknown>) || {};
      const dAcct = (dEnv?.account as Record<string, unknown>) || dEnv;
      dSavingsId = dSavingsId || String(dAcct?.id ?? dEnv?.accountId ?? dEnv?.id ?? "");
      dClientId = dClientId || String(dEnv?.clientId ?? dAcct?.clientId ?? "");
      dClientName = dClientName || String(dEnv?.client ?? dAcct?.client ?? "");
      dBvn = dBvn || String(dEnv?.bvn ?? "");
    }
  }
  if (!dClientId || !dSavingsId) {
    await markSettlement(db, reference, "pending", { evidence: { recipient: rec, enquiry: destEnq }, bumpAttempt: true });
    return { confirmed: false, reference, sourceAccount: source, destinationAccount: destination, code: "PAYOUT_DEST_ENQUIRY_FAILED", error: "Customer account unreachable", evidence: { recipient: rec, enquiry: destEnq } };
  }

  const sEnv = (srcEnq?.data as Record<string, unknown>) || {};
  const sAcct = (sEnv?.account as Record<string, unknown>) || sEnv;

  const isPoolSource = source === VFD_CORPORATE_POOL_NUBAN;
  const fromSavingsId = firstNonEmpty(isPoolSource ? Deno.env.get("VFD_POOL_SAVINGS_ID") : "", sAcct?.id, sEnv?.accountId, sEnv?.id);
  const payload: Record<string, unknown> = {
    fromAccount: source,
    fromClientId: firstNonEmpty(isPoolSource ? Deno.env.get("VFD_POOL_CLIENT_ID") : "", sEnv?.clientId, sAcct?.clientId),
    fromClient: firstNonEmpty(isPoolSource ? Deno.env.get("VFD_POOL_CLIENT_NAME") : "", sEnv?.client, sAcct?.client, sEnv?.name, product?.name),
    fromSavingsId,
    fromBvn: String(sEnv?.bvn ?? ""),
    toAccount: destination,
    toBank: "999999",
    toClient: firstNonEmpty(dClientName, client?.full_name, "Vestara Customer"),
    toClientId: dClientId,
    toSavingsId: dSavingsId,
    toSession: "",
    toBvn: dBvn,
    signature: await transferSignature(source, destination),
    amount: String(amount),
    remark: (p.remark || `${product?.name || productCode} payout`).slice(0, 60),
    transferType: "intra",
    reference,
  };
  // VFD rejects uniqueSenderAccountId when the corporate pool itself is the
  // sender; for sub-account senders it must be the savings id, not the NUBAN.
  if (!isPoolSource && fromSavingsId) payload.uniqueSenderAccountId = fromSavingsId;


  if (!payload.fromClientId || !payload.fromSavingsId) {
    await markSettlement(db, reference, "pending", { evidence: { srcEnq }, bumpAttempt: true });
    return { confirmed: false, reference, sourceAccount: source, destinationAccount: destination, code: "PAYOUT_IDENTITY_MISSING", error: "Payout identities incomplete" };
  }


  console.log(`[savings-payout][${productCode}] ${source} -> ${destination} amount=${amount} ref=${reference}`);
  const { data: transferResp } = await walletRequest("/transfer", "POST", payload);
  const vfdMessage = String(transferResp?.message ?? "");
  const duplicate = String(transferResp?.status ?? "") === "98" || /reference exist/i.test(vfdMessage);

  const verified = await verifyTransfer(reference);
  if (!verified.confirmed) {
    await markSettlement(db, reference, "pending", { evidence: { transfer: transferResp, tsq: verified.evidence }, bumpAttempt: true });
    return {
      confirmed: false, reference, sourceAccount: source, destinationAccount: destination,
      code: duplicate ? "PAYOUT_UNCONFIRMED" : "PAYOUT_FAILED",
      error: vfdMessage || "Payout not confirmed at the bank",
      evidence: { transfer: transferResp, tsq: verified.evidence },
    };
  }

  await markSettlement(db, reference, "confirmed", { evidence: verified.evidence });
  return { confirmed: true, reference, sourceAccount: source, destinationAccount: destination, evidence: verified.evidence, replayed: duplicate };
}
