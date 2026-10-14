import { describe, expect, it } from "vitest";
import {
  formatNaira,
  getUserFriendlyError,
  insufficientBalanceMessage,
  isInsufficientBalanceError,
} from "@/lib/errorMessages";

describe("customer-safe payment errors", () => {
  it.each(["Ledger Error", "ledger balance mismatch", "LEDGER_INTEGRITY_FAILED"])('hides internal wording: %s', (message) => {
    expect(getUserFriendlyError(message)).not.toMatch(/ledger|integrity|mismatch/i);
  });
  it("does not label an electricity decline as a card failure", () => {
    expect(getUserFriendlyError("IKEJA Electricity validated this customer but declined the vend without a specific reason.")).not.toMatch(/card/i);
  });
  it("keeps explicit card declines specific", () => {
    expect(getUserFriendlyError("Your card was declined")).toContain("Your card was declined");
  });
  it("does not claim an uncertain payment was never charged", () => {
    expect(getUserFriendlyError("SETTLEMENT_FUNDING_FAILED")).not.toMatch(/nothing was charged|not taken|returned/i);
  });
});

describe("insufficient balance", () => {
  // The exact rejection the customer hit: ₦1,000 power + ₦100 fee against an ₦842.64 wallet.
  const rejection = {
    error:
      "Insufficient wallet balance. You need ₦1,100 (₦1,000 + ₦100 convenience fee) but have ₦842.64 available. Please fund your wallet with at least ₦257.36.",
    code: "INSUFFICIENT_BALANCE",
    required: 1100,
    convenience_fee: 100,
    available: 842.6399999999999,
    shortfall: 257.3600000000001,
  };

  it("recognises the low-balance rejection", () => {
    expect(isInsufficientBalanceError(rejection)).toBe(true);
    expect(isInsufficientBalanceError(new Error(rejection.error))).toBe(true);
    expect(isInsufficientBalanceError("The biller declined this purchase")).toBe(false);
  });

  it("states the shortfall in plain naira, without floating-point tails", () => {
    const message = insufficientBalanceMessage(rejection);
    expect(message).toContain("257.36");
    expect(message).not.toMatch(/257\.360|842\.639|₦842\.64 available|code/i);
    expect(message).toMatch(/fund your wallet/i);
  });

  it("falls back to the amount needed, then to a general top-up prompt", () => {
    expect(insufficientBalanceMessage({ required: 1100 })).toMatch(/1,100/);
    expect(insufficientBalanceMessage()).toMatch(/top up/i);
  });

  it("rounds amounts sensibly", () => {
    expect(formatNaira(842.6399999999999)).toMatch(/^842\.64$/);
    expect(formatNaira(1100)).toMatch(/^1,100$/);
  });
});
