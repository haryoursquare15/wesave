// ---------------------------------------------------------------------------
// Bill customer-validation policy — SINGLE SOURCE OF TRUTH
// ---------------------------------------------------------------------------
// VFD mandates a /customervalidate call before /pay for several bill families
// (electricity/utility, cable TV, betting, gaming, education). This module owns
// that decision so no caller (direct pay, SplitPay settlement, recurring runner,
// future integrations) can drift from the policy.
//
// Resolution order — most stable identifier first:
//   1. Explicit operator override map (env VFD_BILL_VALIDATION_OVERRIDES)
//   2. Stable VFD identifiers: billerId / productId / divisionId tokens
//   3. Category name (environment-dependent, fallback only)
//   4. Payment item name (last resort)
// If nothing matches we DO NOT silently skip — we return confident:false and
// callers must fail safe (attempt validation, else reject).
// ---------------------------------------------------------------------------

export type BillFamily =
  | "airtime"
  | "data"
  | "electricity"
  | "cabletv"
  | "betting"
  | "gaming"
  | "education"
  | "unknown";

export interface BillIdentity {
  category?: string | null;
  billerId?: string | null;
  billerName?: string | null;
  paymentItemName?: string | null;
  productId?: string | null;
  divisionId?: string | null;
}

export interface ValidationPolicy {
  family: BillFamily;
  /** true => /customervalidate MUST return status "00" before /pay */
  required: boolean;
  /** false => we could not confidently classify; caller must fail safe */
  confident: boolean;
  /** which signal produced the verdict */
  matchedBy: "override" | "biller_id" | "product_id" | "category" | "item_name" | "none";
  reason: string;
}

/** Families that VFD requires customer validation for. */
const VALIDATION_REQUIRED_FAMILIES: ReadonlySet<BillFamily> = new Set<BillFamily>([
  "electricity",
  "cabletv",
  "betting",
  "gaming",
  "education",
]);

/** Families that are explicitly validation-exempt (MSISDN delivered). */
const VALIDATION_EXEMPT_FAMILIES: ReadonlySet<BillFamily> = new Set<BillFamily>([
  "airtime",
  "data",
]);

// Token tables. Matched against the *stable* identifiers first.
const FAMILY_TOKENS: Array<{ family: BillFamily; re: RegExp }> = [
  { family: "electricity", re: /(electric|power|disco|energy|phcn|nepa|prepaid|postpaid|aedc|ikedc|ekedc|ibedc|eedc|jedc|kedco|phed|kaedco|aba\s*power|bedc|yedc)/i },
  { family: "cabletv", re: /(cable|dstv|gotv|startimes|showmax|multichoice|tstv|decoder|iptv|tv\s*subscription)/i },
  { family: "betting", re: /(bet|betting|bookmaker|sportybet|bet9ja|nairabet|1xbet|betking|merrybet|betway|msport|parimatch)/i },
  { family: "gaming", re: /(gaming|lotto|lottery|game\s*credit|baba\s*ijebu|casino)/i },
  { family: "education", re: /(education|school|tuition|jamb|waec|neco|nabteb|exam|pin\s*vending|result\s*checker|profile\s*code)/i },
  { family: "data", re: /(\bdata\b|databundle|data\s*bundle|internet|broadband|smile|spectranet)/i },
  { family: "airtime", re: /(airtime|recharge|topup|top\s*up|vtu)/i },
];

function matchFamily(haystack: string): BillFamily | null {
  if (!haystack.trim()) return null;
  for (const { family, re } of FAMILY_TOKENS) {
    if (re.test(haystack)) return family;
  }
  return null;
}

/** Operator override: { "<billerId>": "electricity" | "none" | ... } */
function readOverrides(): Record<string, string> {
  try {
    const raw = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
      .Deno?.env.get("VFD_BILL_VALIDATION_OVERRIDES");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

/**
 * Determine whether a bill requires VFD customer validation before payment.
 * This is the ONLY place bill-category policy lives.
 */
export function billCategoryRequiresValidation(identity: BillIdentity): ValidationPolicy {
  const billerId = String(identity.billerId ?? "").trim();
  const productId = String(identity.productId ?? "").trim();
  const divisionId = String(identity.divisionId ?? "").trim();
  const category = String(identity.category ?? "").trim();
  const itemName = String(identity.paymentItemName ?? "").trim();
  const billerName = String(identity.billerName ?? "").trim();

  // 1. Explicit override keyed on the stable biller id
  const overrides = readOverrides();
  const ov = billerId && (overrides[billerId] ?? overrides[billerId.toLowerCase()]);
  if (ov) {
    const fam = String(ov).toLowerCase();
    if (fam === "none" || fam === "exempt") {
      return { family: "unknown", required: false, confident: true, matchedBy: "override", reason: `Override marks biller ${billerId} validation-exempt` };
    }
    const family = fam as BillFamily;
    return {
      family,
      required: VALIDATION_REQUIRED_FAMILIES.has(family),
      confident: true,
      matchedBy: "override",
      reason: `Override maps biller ${billerId} to ${family}`,
    };
  }

  // 2. Stable identifiers (biller id / biller name are the closest thing VFD
  //    gives us to a durable key; product & division ids next).
  const idFamily = matchFamily(`${billerId} ${billerName}`);
  if (idFamily) {
    return {
      family: idFamily,
      required: VALIDATION_REQUIRED_FAMILIES.has(idFamily),
      confident: true,
      matchedBy: "biller_id",
      reason: `Biller identifier matched ${idFamily}`,
    };
  }
  const prodFamily = matchFamily(`${productId} ${divisionId}`);
  if (prodFamily) {
    return {
      family: prodFamily,
      required: VALIDATION_REQUIRED_FAMILIES.has(prodFamily),
      confident: true,
      matchedBy: "product_id",
      reason: `Product/division identifier matched ${prodFamily}`,
    };
  }

  // 3. Category name (environment dependent — fallback only)
  const catFamily = matchFamily(category);
  if (catFamily) {
    return {
      family: catFamily,
      required: VALIDATION_REQUIRED_FAMILIES.has(catFamily),
      confident: true,
      matchedBy: "category",
      reason: `Category name matched ${catFamily}`,
    };
  }
  // "Utility" on its own is an electricity-family umbrella in VFD's catalogue
  if (/^utilit/i.test(category)) {
    return { family: "electricity", required: true, confident: true, matchedBy: "category", reason: "Utility category requires validation" };
  }

  // 4. Payment item name (last resort)
  const itemFamily = matchFamily(itemName);
  if (itemFamily) {
    return {
      family: itemFamily,
      required: VALIDATION_REQUIRED_FAMILIES.has(itemFamily),
      confident: VALIDATION_EXEMPT_FAMILIES.has(itemFamily) ? false : true,
      matchedBy: "item_name",
      reason: `Payment item name matched ${itemFamily}`,
    };
  }

  // 5. Unknown — fail safe. Caller must validate, and reject if it cannot.
  return {
    family: "unknown",
    required: true,
    confident: false,
    matchedBy: "none",
    reason: "Bill category could not be classified — validating defensively",
  };
}

export interface ValidationRecord {
  required: boolean;
  family: BillFamily;
  matched_by: string;
  performed: boolean;
  passed: boolean;
  validation_request_id: string | null;
  validation_status: string | null;
  validation_message: string | null;
  customer_name: string | null;
  validated_at: string | null;
  biller_id: string | null;
  customer_id: string | null;
  payment_reference: string | null;
  raw: Record<string, unknown> | null;
}

export interface EnforceArgs {
  identity: BillIdentity;
  customerId: string;
  divisionId: string;
  paymentItem: string;
  billerId: string;
  paymentReference: string;
  /** performs GET {billsBase}/customervalidate?... and returns parsed JSON + http ok */
  validate: (args: {
    customerId: string; divisionId: string; paymentItem: string; billerId: string; requestId: string;
  }) => Promise<{ ok: boolean; body: Record<string, unknown> | null }>;
}

export interface EnforceResult {
  allowed: boolean;
  /** user-facing error when allowed === false */
  error?: string;
  code?: string;
  record: ValidationRecord;
}

/**
 * Backend enforcement gate. Runs customer validation when the policy requires
 * it and only allows /pay when the biller returns status "00".
 * Never trusts a client-supplied validation result.
 */
export async function enforceBillCustomerValidation(args: EnforceArgs): Promise<EnforceResult> {
  const policy = billCategoryRequiresValidation(args.identity);
  const base: ValidationRecord = {
    required: policy.required,
    family: policy.family,
    matched_by: policy.matchedBy,
    performed: false,
    passed: false,
    validation_request_id: null,
    validation_status: null,
    validation_message: null,
    customer_name: null,
    validated_at: null,
    biller_id: args.billerId || null,
    customer_id: args.customerId || null,
    payment_reference: args.paymentReference || null,
    raw: null,
  };

  if (!policy.required) {
    return { allowed: true, record: { ...base, passed: true } };
  }

  if (!args.customerId || !args.divisionId || !args.paymentItem || !args.billerId) {
    return {
      allowed: false,
      code: "VALIDATION_UNAVAILABLE",
      error: "This biller requires customer verification, but the biller details are incomplete. Please reselect the biller and try again.",
      record: { ...base, validation_message: "missing validate fields" },
    };
  }

  const requestId = crypto.randomUUID();
  let ok = false;
  let body: Record<string, unknown> | null = null;
  try {
    const res = await args.validate({
      customerId: args.customerId,
      divisionId: args.divisionId,
      paymentItem: args.paymentItem,
      billerId: args.billerId,
      requestId,
    });
    ok = res.ok;
    body = res.body;
  } catch (e) {
    body = { error: e instanceof Error ? e.message : String(e) };
  }

  const status = body && typeof body.status !== "undefined" ? String(body.status) : null;
  const message = body && typeof body.message !== "undefined" ? String(body.message) : null;
  const inner = (body?.data && typeof body.data === "object" ? body.data as Record<string, unknown> : null);
  // VFD nests the biller's record at data.responseData.customer for some billers.
  const rd = (inner?.responseData && typeof inner.responseData === "object" ? inner.responseData as Record<string, unknown> : null);
  const cust = (rd?.customer && typeof rd.customer === "object" ? rd.customer as Record<string, unknown> : null);
  const customerName = String(
    (body?.customerName ?? inner?.customerName ?? inner?.customer_name ?? cust?.customerName ?? inner?.name ?? body?.name ?? "") || "",
  ) || null;

  // NOTE: VFD's /customervalidate does NOT return a customer name for any
  // biller (confirmed across completed DSTV, EKEDC and SportyBet payments), so
  // a missing name must not be treated as a failure — status "00" is the pass.
  const record: ValidationRecord = {
    ...base,
    performed: true,
    passed: ok && status === "00",
    validation_request_id: requestId,
    validation_status: status,
    validation_message: message,
    customer_name: customerName,
    validated_at: new Date().toISOString(),
    raw: body,
  };

  if (!record.passed) {
    const detail = message && message.length < 160 ? message : "the biller could not confirm this account";
    return {
      allowed: false,
      code: policy.confident ? "CUSTOMER_VALIDATION_FAILED" : "BILLER_CONFIG_REVIEW",
      error: policy.confident
        ? `We couldn't verify this account with ${args.identity.billerName || "the biller"} — ${detail}. Check the meter/smartcard/account number and try again.`
        : `This biller needs verification before payment and we couldn't complete it (${detail}). Our team has been notified to review this biller's setup.`,
      record,
    };
  }

  return { allowed: true, record };
}
