import { describe, expect, it } from "vitest";
import { cleanCustomerName, customerFirstName } from "@/lib/customerName";

describe("cleanCustomerName", () => {
  it("strips the WeSave Ng Ltd corporate prefix", () => {
    expect(cleanCustomerName("WeSave Ng Ltd-BOLUWATIFE ABIOLA ADESINA")).toBe("BOLUWATIFE ABIOLA ADESINA");
  });

  it("strips the VES prefix", () => {
    expect(cleanCustomerName("VES-YUSUF BABAJIDE ABASS")).toBe("YUSUF BABAJIDE ABASS");
  });

  it("keeps inner hyphens inside the customer name", () => {
    expect(cleanCustomerName("WeSave Ng Ltd-ONUORA - ODITA")).toBe("ONUORA - ODITA");
  });

  it("returns plain names untouched", () => {
    expect(cleanCustomerName("BOLUWATIFE ABIOLA ADESINA")).toBe("BOLUWATIFE ABIOLA ADESINA");
  });

  it("handles empty values", () => {
    expect(cleanCustomerName(null)).toBe("");
    expect(cleanCustomerName("")).toBe("");
  });
});

describe("customerFirstName", () => {
  it("returns the first name after the prefix, capitalised", () => {
    expect(customerFirstName("WeSave Ng Ltd-SAMIR ADEBAYO ALAMUKII")).toBe("Samir");
  });

  it("falls back when the name is missing", () => {
    expect(customerFirstName(null, "there")).toBe("there");
  });
});
