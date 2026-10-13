import { describe, expect, it } from "vitest";
import { mandateAuthorizationDetails } from "@/lib/mandateAuthorizationDetails";

describe("mandate authorization receiving details", () => {
  it("extracts the receiving bank and account name from provider instructions", () => {
    const message = 'Kindly proceed with a token payment of N50:00 into account number "9880218357" with PAYSTACK - TITAN, Account name is NIGERIA INTERBANK SETTLEMENT SYSTEM PLC. Note: The payment should be done from the account on which the mandate is setup.';
    expect(mandateAuthorizationDetails(message)).toEqual({ bank: "PAYSTACK - TITAN", accountName: "NIGERIA INTERBANK SETTLEMENT SYSTEM PLC" });
  });

  it("does not invent a receiving bank when instructions are missing", () => {
    expect(mandateAuthorizationDetails(null)).toEqual({ bank: "See bank in authorization instructions", accountName: "NIBSS (Nigeria Interbank Settlement System Plc)" });
  });
});