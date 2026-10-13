// VFD registers sub-accounts as "<Corporate>-<CUSTOMER NAME>" (e.g.
// "WeSave Ng Ltd-SAMIR ADEBAYO ALAMUKII") or "VES-<CUSTOMER NAME>".
// Customers should only ever see their own name — strip the corporate prefix
// everywhere the bank-provided name is displayed. The stored record is untouched.
const CORPORATE_PREFIX = /^(?:w(?:e|e)save ng ltd|wesave ng ltd|ves)\s*-\s*/i;

export function cleanCustomerName(raw?: string | null): string {
  const name = (raw ?? "").trim();
  if (!name) return "";
  // Only strip when the hyphen directly follows the known corporate token,
  // so names like "ONUORA - ODITA" keep their inner text.
  const cleaned = name.replace(CORPORATE_PREFIX, "").trim();
  return cleaned || name;
}

export function customerFirstName(raw?: string | null, fallback = "there"): string {
  const first = cleanCustomerName(raw).split(/\s+/)[0];
  if (!first) return fallback;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
