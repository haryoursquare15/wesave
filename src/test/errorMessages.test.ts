import { describe, expect, it } from "vitest";
import { getUserFriendlyError } from "@/lib/errorMessages";

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