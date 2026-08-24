/**
 * Central, human-readable labelling for transactions.
 *
 * Every history row, receipt and confirmation screen should describe WHAT the
 * transaction was for ("Airtime — MTN", "Transfer to Jane Doe", "Vault savings
 * subscription") instead of a generic type ("Debit", "Bill Payment").
 *
 * The parser works off the data we already persist on each transaction record:
 * `transaction_type`, `description` and `reference`.
 */

export interface TxLike {
  transaction_type: string;
  description?: string | null;
  reference?: string | null;
  amount?: number;
  status?: string;
  /** Transfer recipient captured on the record, when available */
  beneficiary_name?: string | null;
  beneficiary_account?: string | null;
  beneficiary_bank?: string | null;
}

export interface TxDescriptor {
  /** Primary line, e.g. "Airtime — MTN" */
  title: string;
  /** Secondary line: recipient, phone/meter number, group, share info */
  subtitle?: string;
  /** Short category chip, e.g. "Airtime", "Transfer", "Thrift" */
  category: string;
  /** Whether money came in */
  isCredit: boolean;
}

const CREDIT_TYPES = ["credit", "unlock", "interest", "payout", "refund"];

/** Map a biller/product name to a customer-friendly bill category. */
export function billCategoryFor(name: string, extra = ""): string {
  const s = `${name} ${extra}`.toLowerCase();
  if (/\bdata\b|bundle|\bgb\b|\bmb\b/.test(s)) return "Data";
  if (/mtn|airtel|glo|9mobile|etisalat|airtime|vtu/.test(s)) return "Airtime";
  if (/electric|disco|ekedc|ikeja|ibedc|phed|kedco|aedc|eedc|jed|kaedco|bedc|meter|prepaid|postpaid/.test(s))
    return "Utility";
  if (/dstv|gotv|startimes|showmax|cable|tv/.test(s)) return "Cable TV";
  if (/bet|sporty|bet9ja|1xbet|nairabet|betking/.test(s)) return "Betting";
  if (/spectranet|smile|swift|internet|wifi|isp/.test(s)) return "Internet";
  if (/water|waste|lawma|tax|levy|school|wa?ec|jamb/.test(s)) return "Government & Utilities";
  return "Bill";
}

function cleanInflowNarration(desc: string): string {
  // "FRM JOHN DOE|MOB: To VFD MFB|WeSave Ng Ltd-JANE  " -> "JOHN DOE"
  const m = desc.match(/^FRM\s+([^|]+)/i);
  if (m) return m[1].trim();
  const m2 = desc.match(/^From\s+([^/]+)\/?(.*)$/i);
  if (m2) return (m2[2] || m2[1]).trim();
  return desc.trim();
}

export function describeTransaction(tx: TxLike): TxDescriptor {
  const desc = (tx.description || "").trim();
  const ref = (tx.reference || "").trim();
  const blob = `${desc} ${ref}`.toLowerCase();
  const isCredit = CREDIT_TYPES.includes(tx.transaction_type);

  // ---- Bills (incl. refunds) -------------------------------------------
  const billMatch = desc.match(/^(?:Refund:\s*)?bill payment[:\s-]*\s*(.+)$/i);
  if (billMatch || /(^|\s)(vestara|wesave)-bill-/.test(blob)) {
    const body = (billMatch?.[1] || desc).replace(/^Refund:\s*/i, "");
    // "MTN - 08105244968 (incl. ₦30 fee)"
    const parts = body.split(/\s+[-–—]\s+/);
    const biller = (parts[0] || "Bill").trim();
    const customer = (parts[1] || "").replace(/\(.*?\)/g, "").trim();
    const category = billCategoryFor(biller, body);
    const isRefund = /refund/i.test(desc) || /-refund/i.test(ref);
    return {
      title: isRefund ? `${category} refund — ${biller}` : `${category} — ${biller}`,
      subtitle: customer || undefined,
      category: isRefund ? "Refund" : category,
      isCredit,
    };
  }

  // ---- Split bill --------------------------------------------------------
  if (/^splitpay/i.test(desc) || /^splitpay-/.test(ref)) {
    const inner = desc.replace(/^SplitPay\s*(\(Bill\))?:?\s*/i, "");
    const seg = inner.split(/\s+[-–—]\s+/);
    const billName = (seg[0] || "Split bill").trim();
    const share = seg.slice(1).filter((s) => /share|fee|₦/i.test(s)).join(" · ");
    return {
      title: isCredit ? `Split bill settlement — ${billName}` : `Split bill — ${billName}`,
      subtitle: [seg[1] && !/share|fee/i.test(seg[1]) ? seg[1].trim() : null, share || null]
        .filter(Boolean)
        .join(" · ") || undefined,
      category: "Split bill",
      isCredit,
    };
  }

  // ---- Savings products --------------------------------------------------
  const product = /vault/.test(blob)
    ? "Vault"
    : /lockmax|lock max/.test(blob)
    ? "LockMax"
    : /upfront/.test(blob)
    ? "Upfront Yield"
    : /goal\s*save|goalsave/.test(blob)
    ? "Goal Savings"
    : null;
  if (product || /savings|interest accrual/.test(blob) || tx.transaction_type === "savings") {
    const name = product || "Savings";
    let action = "subscription";
    if (/matur/.test(blob)) action = "maturity payout";
    else if (/withdraw/.test(blob)) action = "withdrawal";
    else if (/interest/.test(blob)) action = "interest earned";
    else if (/refund|revers/.test(blob)) action = "reversal";
    else if (isCredit) action = "payout";
    return {
      title: `${name} — ${action}`,
      subtitle: desc || undefined,
      category: "Savings",
      isCredit,
    };
  }

  // ---- Locks -------------------------------------------------------------
  if (tx.transaction_type === "lock" || tx.transaction_type === "unlock") {
    return {
      title: tx.transaction_type === "lock" ? "Funds locked" : "Funds unlocked to wallet",
      subtitle: desc || undefined,
      category: "Lock",
      isCredit,
    };
  }

  // ---- Thrift / Ajo / Target --------------------------------------------
  if (/ajo|thrift|target/.test(blob)) {
    const isTarget = /target/.test(blob);
    const groupMatch = desc.match(/(?:group|ajo|thrift|target)[:\s-]+([^—\-|]+)/i);
    const group = groupMatch?.[1]?.trim();
    const payout = /payout|withdraw/.test(blob) || (isCredit && !/contribut/.test(blob));
    const kind = isTarget
      ? payout ? "Target withdrawal" : "Target contribution"
      : payout ? "Thrift payout" : "Thrift contribution";
    return {
      title: group ? `${kind} — ${group}` : kind,
      subtitle: group ? desc : desc || undefined,
      category: isTarget ? "Target" : "Thrift",
      isCredit,
    };
  }

  // ---- Goal campaigns ----------------------------------------------------
  if (/goal|campaign|crowdfund/.test(blob)) {
    return {
      title: isCredit ? "Goal contribution received" : "Goal contribution",
      subtitle: desc || undefined,
      category: "Goals",
      isCredit,
    };
  }

  // ---- Fees / duties -----------------------------------------------------
  if (/stamp\s*duty/.test(blob)) return { title: "Stamp duty", subtitle: desc, category: "Fee", isCredit };
  if (/\bfee\b|charge/.test(blob)) return { title: "Service fee", subtitle: desc, category: "Fee", isCredit };

  // ---- Refunds / reversals ----------------------------------------------
  if (/refund|revers/.test(blob)) {
    return { title: "Refund to wallet", subtitle: desc || undefined, category: "Refund", isCredit };
  }

  // ---- Wallet funding ----------------------------------------------------
  if (isCredit && /fund|top.?up|deposit|^frm\b|^from\b/i.test(desc)) {
    const who = cleanInflowNarration(desc);
    return {
      title: who ? `Money received — ${who}` : "Wallet funding",
      subtitle: who ? undefined : desc || undefined,
      category: "Funding",
      isCredit: true,
    };
  }

  // ---- Transfers ---------------------------------------------------------
  if (tx.transaction_type === "transfer" || tx.transaction_type === "debit" || tx.transaction_type === "credit") {
    const narration = desc && !/^vestara transfer$/i.test(desc) ? cleanInflowNarration(desc) : "";
    if (isCredit) {
      return {
        title: narration ? `Transfer received — ${narration}` : "Transfer received",
        category: "Transfer",
        isCredit,
      };
    }
    return {
      title: narration ? `Transfer sent — ${narration}` : "Transfer sent",
      category: "Transfer",
      isCredit,
    };
  }

  return {
    title: desc || tx.transaction_type,
    category: tx.transaction_type,
    isCredit,
  };
}

/** Convenience: single-line label for compact rows. */
export function transactionLabel(tx: TxLike): string {
  return describeTransaction(tx).title;
}
