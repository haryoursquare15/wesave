import { describe, expect, it } from "vitest";
import { failedComplaintTransactions } from "../lib/complaintTransactions";

const transactions = [
  { reference: "txn-electricity", transaction_type: "bill_payment", description: "IKEDC", status: "failed" },
  { reference: "wallet-credit", transaction_type: "credit", description: "Jane Doe", status: "failed" },
  { reference: "transfer-out", transaction_type: "debit", description: "Transfer to Jane", status: "failed" },
  { reference: "bill-success", transaction_type: "bill_payment", description: "IKEDC", status: "completed" },
  { reference: "vestara-bill-123", transaction_type: "debit", description: null, status: "reversed" },
];

describe("complaint transaction categories", () => {
  it("shows an empty list rather than other services when no transactions match", () => {
    expect(failedComplaintTransactions(transactions, "savings")).toEqual([]);
    expect(failedComplaintTransactions(transactions, "account")).toEqual([]);
  });
  it("keeps failed bills, wallet credits and transfers separate", () => {
    expect(failedComplaintTransactions(transactions, "bills").map(tx => tx.reference)).toEqual(["txn-electricity", "vestara-bill-123"]);
    expect(failedComplaintTransactions(transactions, "add_money").map(tx => tx.reference)).toEqual(["wallet-credit"]);
    expect(failedComplaintTransactions(transactions, "transfers").map(tx => tx.reference)).toEqual(["transfer-out"]);
  });
});