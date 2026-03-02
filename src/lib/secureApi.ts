import { supabase } from "@/integrations/supabase/client";

// Financial actions that require replay protection headers
const FINANCIAL_ACTIONS = new Set([
  'fund_wallet', 'withdraw_to_bank', 'initiate_contribution', 'process_payout',
]);

/**
 * Generate a cryptographic nonce for request replay protection
 */
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Invoke a backend function with automatic rate-limiting and replay protection headers.
 * Use this instead of `supabase.functions.invoke("flutterwave-payments", ...)` for all
 * financial and sensitive operations.
 */
export async function invokeSecureFunction(
  body: { action: string; [key: string]: unknown }
) {
  const headers: Record<string, string> = {};

  // Add replay protection headers for financial actions
  if (FINANCIAL_ACTIONS.has(body.action)) {
    headers['x-request-nonce'] = generateNonce();
    headers['x-request-timestamp'] = Date.now().toString();
  }

  const { data, error } = await supabase.functions.invoke("flutterwave-payments", {
    body,
    headers,
  });

  return { data, error };
}
