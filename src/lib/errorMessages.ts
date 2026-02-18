/**
 * Standardized error messages for the platform.
 * Maps technical/backend errors to user-friendly messages.
 */

const ERROR_MAP: Record<string, string> = {
  // Withdrawal errors
  "minimum withdrawal": "The minimum withdrawal amount is ₦1,100. Please enter a higher amount.",
  "insufficient": "You don't have enough funds for this transaction.",
  "bank details are missing": "Please add your bank details in Settings before making a withdrawal.",
  "unable to verify bank": "We couldn't verify your bank account. Please check your details and try again.",
  "unable to find bank": "We couldn't verify your bank account. Please check your details and try again.",
  "transfer failed": "Your withdrawal could not be completed at this time. Please try again shortly.",
  "too low after fees": "The withdrawal amount is too small after the ₦100 processing fee.",
  "ip whitelisting": "We're experiencing a temporary issue. Our team has been notified — please try again later.",
  "cooldown": "Withdrawals are temporarily restricted after a recent bank detail change. Please wait 24 hours.",
  
  // Auth errors
  "unauthorized": "Your session has expired. Please log in again.",
  "no authorization": "Your session has expired. Please log in again.",
  "google": "Google sign-in is required to complete this action.",
  "2fa": "Verification failed. Please check your code and try again.",
  "invalid 2fa": "Verification failed. Please check your code and try again.",
  "token": "Verification code is invalid or has expired.",
  
  // Limit errors
  "daily limit": "You've reached your daily withdrawal limit of ₦500,000. Please try again tomorrow.",
  "monthly limit": "You've reached your monthly withdrawal limit of ₦5,000,000.",
  "exceeded": "You've exceeded your transaction limit. Please try again later or contact support.",
  
  // General errors
  "profile not found": "We couldn't find your account details. Please contact support.",
  "network": "Connection error. Please check your internet and try again.",
  "timeout": "The request timed out. Please try again.",
  "rate limit": "Too many requests. Please wait a moment and try again.",
  
  // Bank/Card errors
  "restricted card": "Your card has been restricted. Please contact your bank or try a different card.",
  "declined": "Your transaction was declined. Please try a different payment method or contact your bank.",
  "card expired": "Your card has expired. Please update your card details.",
  
  // OTP errors
  "otp expired": "Your verification code has expired. Please request a new one.",
  "otp invalid": "Invalid verification code. Please check and try again.",
  "otp too many": "Too many verification attempts. Please wait 5 minutes and try again.",
};

/**
 * Converts a technical error message to a user-friendly message.
 */
export function getUserFriendlyError(error: unknown): string {
  const DEFAULT_MESSAGE = "Something went wrong. Please try again or contact support if the issue persists.";
  
  if (!error) return DEFAULT_MESSAGE;
  
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (lower.includes(key.toLowerCase())) {
      return friendly;
    }
  }
  
  return DEFAULT_MESSAGE;
}

/**
 * Returns a user-friendly error for display in toast notifications.
 */
export function toastError(error: unknown): string {
  return getUserFriendlyError(error);
}
