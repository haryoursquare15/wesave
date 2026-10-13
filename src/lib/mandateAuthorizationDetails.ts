/** Receiving details come from the provider's authorization instructions, not the payer bank. */
export function mandateAuthorizationDetails(message: string | null | undefined) {
  const bank = message?.match(/\bwith\s+([^,\n]+),\s*account\s+name\s+is\b/i)?.[1]?.trim();
  const accountName = message?.match(/\baccount\s+name\s+is\s+([^\n]+?)(?:\.\s*(?:Note\b|$)|$)/i)?.[1]?.trim();
  return {
    bank: bank || "See bank in authorization instructions",
    accountName: accountName || "NIBSS (Nigeria Interbank Settlement System Plc)",
  };
}