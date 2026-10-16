import { describeTransaction, type TxLike } from "./transactionLabels";

/** Assign each transaction to one service; never fall back to unrelated rows. */
export function complaintServiceForTransaction(tx: TxLike): string | null {
  const type = tx.transaction_type.toLowerCase();
  const text = `${type} ${tx.description ?? ""} ${tx.reference ?? ""}`.toLowerCase();
  if (/splitpay|split[_ -]?(pay|bill)/.test(text)) return "split";
  if (/escrow/.test(text)) return "escrow";
  if (/bill[_ -]?payment|(?:vestara|wesave)-bill-|airtime|ikedc|ekedc|electricity|sportybet/.test(text)) return "bills";
  const category = describeTransaction(tx).category.toLowerCase();
  if (["airtime", "data", "utility", "cable tv", "betting", "internet", "government & utilities", "bill"].includes(category)) return "bills";
  if (category === "thrift" || category === "target") return "ajo";
  if (["savings", "lock", "goals"].includes(category)) return "savings";
  if (category === "split bill") return "split";
  if (category === "fee" || type === "fee") return "fees";
  if (category === "funding" || type === "credit" || /wallet[_ -]?(fund|credit)|inflow|top[_ -]?up|deposit/.test(text)) return "add_money";
  if (category === "transfer" || /transfer|withdraw/.test(type)) return "transfers";
  return null;
}

export function failedComplaintTransactions<T extends TxLike>(transactions: T[], service: string): T[] {
  return transactions.filter(tx =>
    ["failed", "reversed", "refunded"].includes(tx.status?.toLowerCase() ?? "") &&
    complaintServiceForTransaction(tx) === service
  );
}