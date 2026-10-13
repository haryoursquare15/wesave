/**
 * Customer-friendly, action-oriented error messages.
 *
 * All user-facing errors should be routed through `getUserFriendlyError()`.
 * The goal: never show a raw backend / API / database error to the user.
 *
 * Tone: warm, plain English, always tells the user the next step.
 *
 * NOTE for future contributors:
 *   - Keys are matched as case-insensitive substrings against the raw error.
 *   - More specific keys go first (the FIRST match wins).
 *   - When you add a new error thrown from an edge function or RPC, add a
 *     mapping here so users see actionable text instead of jargon.
 */

const DEFAULT_MESSAGE =
  "Something didn't go through. Please try again — if the issue continues, tap Support so we can help.";

// Ordered: more specific phrases first.
const ERROR_MAP: Array<[string, string]> = [
  // ─── Connectivity / platform ────────────────────────────────────────────
  ["failed to fetch", "We couldn't reach Vestara. Check your internet connection and try again."],
  ["networkerror", "We couldn't reach Vestara. Check your internet connection and try again."],
  ["network request failed", "We couldn't reach Vestara. Check your internet connection and try again."],
  ["load failed", "We couldn't reach Vestara. Check your internet connection and try again."],
  ["timeout", "This is taking longer than usual. Please try again in a moment."],
  ["timed out", "This is taking longer than usual. Please try again in a moment."],
  ["settlement_funding_unconfirmed", "We're still confirming this payment. Please check your transactions shortly before trying again."],
  ["settlement_funding_failed", "We couldn't move your funds right now. Nothing was charged — please try again shortly."],
  ["invalid wallet token", "We're reconnecting to your wallet. Please try again in a moment."],
  ["jwt expired", "Your session has ended. Please sign in again to continue."],
  ["invalid jwt", "Your session has ended. Please sign in again to continue."],
  ["permission denied", "You don't have permission to do that."],
  ["row-level security", "You don't have permission to do that."],
  ["duplicate key", "This has already been done. Please refresh to see the latest."],
  // ─── Auth / Session ─────────────────────────────────────────────────────
  ["already registered", "This email is already registered. Please sign in instead."],
  ["invalid login credentials", "That email or password didn't match. Please try again or reset your password."],
  ["invalid email or password", "That email or password didn't match. Please try again or reset your password."],
  ["email not confirmed", "Please confirm your email first — check your inbox for the verification link."],
  ["email rate limit", "Too many email attempts. Please wait a few minutes and try again."],
  ["reset link is invalid", "This reset link has expired. Please request a new one."],
  ["reset link may be invalid", "This reset link has expired. Please request a new one."],
  ["reset session missing", "Your reset session has expired. Please request a new reset link."],
  ["invalid or expired", "This link or code has expired. Please request a new one."],
  ["passwords do not match", "Those passwords don't match. Please re-enter them."],
  ["password must be at least", "Use a password with at least 6 characters."],
  ["please sign in first", "Please sign in to continue."],
  ["not signed in", "Please sign in to continue."],
  ["not authenticated", "Your session has ended. Please sign in again to continue."],
  ["session expired", "Your session has ended. Please sign in again to continue."],
  ["session has expired", "Your session has ended. Please sign in again to continue."],
  ["unauthorized", "Your session has ended. Please sign in again to continue."],
  ["no authorization", "Your session has ended. Please sign in again to continue."],
  ["authentication required", "Please sign in to continue."],
  ["please log in again", "Your session has ended. Please sign in again to continue."],
  ["forbidden", "You don't have permission to do that."],
  ["not authorized", "You don't have permission to do that."],
  ["failed to sign out", "We couldn't sign you out. Please refresh the page and try again."],
  ["failed to sign in with google", "Google sign-in didn't complete. Please try again."],
  ["failed to sign in with apple", "Apple sign-in didn't complete. Please try again."],
  ["google sign-in is required", "Please sign in with Google to continue with this action."],

  // ─── 2FA / Verification codes ───────────────────────────────────────────
  ["please enter a 6-digit code", "Please enter the full 6-digit code."],
  ["please enter a valid code", "Please enter the full verification code."],
  ["invalid verification code", "That code didn't match. Please check it and try again."],
  ["verification code is required", "Please enter the verification code we sent you."],
  ["verification code is required to disable", "Enter the verification code we sent to confirm turning off 2FA."],
  ["2fa is already enabled", "Two-factor authentication is already turned on for your account."],
  ["2fa is not enabled", "Two-factor authentication isn't turned on yet."],
  ["no pending 2fa setup", "Your 2FA setup expired. Please start the setup again."],
  ["failed to disable 2fa", "We couldn't turn off 2FA right now. Please try again in a moment."],
  ["invalid 2fa code", "That code didn't match. Please check it and try again."],
  ["2fa token is required", "Please enter your 2FA code to continue."],
  ["failed to verify 2fa", "We couldn't verify your 2FA code. Please try again."],
  ["security configuration error", "Security setup is unavailable right now. Please contact support."],
  ["failed to send verification email", "We couldn't send the verification email. Please try again shortly."],
  ["could not send the verification email", "We couldn't send the verification email. Please try again shortly."],
  ["too many verification attempts", "Too many tries. Please wait 15 minutes and try again."],
  ["otp expired", "Your verification code has expired. Please request a new one."],
  ["otp invalid", "That code didn't match. Please check it and try again."],
  ["otp too many", "Too many tries. Please wait 5 minutes and request a new code."],
  ["token is invalid", "Your verification code has expired. Please request a new one."],

  // ─── Transaction PIN ────────────────────────────────────────────────────
  ["pin is required", "Please enter your 4-digit transaction PIN."],
  ["pin must be 4 digits", "Your transaction PIN must be 4 digits."],
  ["pin already set", "You've already set a transaction PIN. Use 'Change PIN' to update it."],
  ["failed to set pin", "We couldn't save your PIN. Please try again."],
  ["current and new pin required", "Please enter both your current and new PIN."],
  ["no pin set", "You haven't set a transaction PIN yet. Set one in Security Settings to continue."],
  ["pin is locked", "Your PIN is temporarily locked after too many wrong tries. Please wait 15 minutes."],
  ["current pin is incorrect", "Your current PIN is incorrect. Please try again."],
  ["incorrect pin", "Incorrect PIN. Please try again."],

  // ─── Money / Wallet / Withdrawals ───────────────────────────────────────
  ["wallet funding failed", "Your wallet funding didn't go through. Please try again."],
  ["minimum withdrawal", "The minimum withdrawal is ₦1,000. Please enter a higher amount."],
  ["minimum funding amount", "The minimum funding amount is ₦100. Please enter a higher amount."],
  ["amount is below the minimum", "That amount is below the minimum allowed."],
  ["amount exceeds per-transfer limit", "That amount is above the ₦5,000,000 per-transfer limit. Please send a smaller amount."],
  ["amount exceeds escrow balance", "That amount is more than your escrow balance."],
  ["amount exceeds the group", "That amount is more than the group's pooled balance."],
  ["insufficient balance", "You don't have enough funds. Please top up your wallet and try again."],
  ["insufficient funds", "You don't have enough funds. Please top up your wallet and try again."],
  ["insufficient wallet balance", "You don't have enough wallet funds. Please top up your wallet first."],
  ["don't have enough funds", "You don't have enough funds. Please top up your wallet and try again."],
  ["bank details are missing", "Please add your withdrawal bank details in Settings first."],
  ["withdrawal bank details are missing", "Please add your withdrawal bank details in Settings first."],
  ["please add your bank details", "Please add your withdrawal bank details in Settings first."],
  ["unable to verify bank", "We couldn't verify that bank account. Please check the details and try again."],
  ["could not verify account", "We couldn't verify that account. Please check the details and try again."],
  ["bank verification failed", "Bank verification didn't work. Please check the details and try again."],
  ["unable to find bank", "We couldn't find that bank. Please pick a valid Nigerian bank from the list."],
  ["unable to resolve bank code", "We couldn't match your selected bank. Please re-select it from the list."],
  ["bank name and account number are required", "Please enter both the bank name and account number."],
  ["account number must be 10 digits", "Account numbers must be exactly 10 digits."],
  ["please complete bank verification", "Please finish verifying your bank account before continuing."],
  ["unable to freeze funds", "We couldn't reserve the funds for this withdrawal. Please try again shortly."],
  ["transfer failed", "Your transfer didn't go through. Please try again shortly."],
  ["too low after fees", "That amount is too small after the ₦100 transfer fee. Please enter a higher amount."],
  ["too small after the ₦100", "That amount is too small after the ₦100 transfer fee. Please enter a higher amount."],
  ["ip whitelisting", "We're experiencing a temporary issue. Please try again shortly — our team has been notified."],
  ["cooldown", "Withdrawals are paused for 24 hours after a bank detail change. Please try again later."],
  ["bank details can only be changed", "You can only change bank details once every 24 hours. Please try again later."],
  ["daily limit", "You've reached your ₦500,000 daily withdrawal limit. Please try again tomorrow."],
  ["monthly limit", "You've reached your ₦5,000,000 monthly withdrawal limit."],
  ["exceeded", "You've reached your limit for this action. Please try again later."],
  ["invalid amount", "Please enter a valid amount."],
  ["valid amount is required", "Please enter a valid amount."],
  ["enter a valid amount", "Please enter a valid amount."],
  ["minimum ₦100", "The minimum amount is ₦100."],
  ["payment failed", "That payment didn't go through. Please try again."],
  ["payment was not successful", "That payment didn't go through. Please try again."],
  ["payment verification pending", "Your payment is still being verified. We'll update you once it's done."],
  ["failed to credit wallet", "We couldn't credit your wallet right now. Please try again — your funds are safe."],
  ["failed to generate payment link", "We couldn't start that payment. Please try again."],
  ["failed to initiate payment", "We couldn't start that payment. Please try again."],
  ["profile not found", "We couldn't find your account details. Please contact support."],
  ["no vfd account found", "Your bank profile isn't ready yet. Please complete onboarding first."],
  ["could not retrieve sender account", "We couldn't read your account details. Please try again in a moment."],

  // ─── Cards ──────────────────────────────────────────────────────────────
  ["restricted card", "Your card has been restricted. Please use a different card or contact your bank."],
  ["declined", "Your card was declined. Please try a different card or contact your bank."],
  ["card expired", "Your card has expired. Please update your card details."],
  ["no card token", "We couldn't use this card. Please try adding it again."],
  ["card already authorized", "This card is already linked to that group."],
  ["change your card once every 24 hours", "You can only change your card once every 24 hours. Please try again later."],
  ["could not find a recent payment", "We couldn't recover your card. Please add a new card instead."],
  ["no card token available from the payment provider", "We couldn't save your card. Please try adding it again."],
  ["transaction verification failed", "We couldn't verify that transaction. If money left your account, it will be reversed."],
  ["transaction id and target user id are required", "Something went wrong saving that card. Please try again."],
  ["failed to update card token", "We couldn't update your card. Please try again."],
  ["failed to update token", "We couldn't update your card. Please try again."],
  ["card_id required", "Please select a card to continue."],
  ["card not found", "We couldn't find that card."],
  ["card already active", "That card is already active."],
  ["account not found", "We couldn't find your account. Please try again or contact support."],
  ["vfd auth failed", "We're having trouble reaching your bank right now. Please try again in a moment."],
  ["activation failed", "We couldn't activate that card. Please try again."],
  ["pin change failed", "We couldn't change that card's PIN. Please try again."],
  ["block failed", "We couldn't block that card. Please try again."],
  ["unblock failed", "We couldn't unblock that card. Please try again."],

  // ─── KYC / BVN / Onboarding ─────────────────────────────────────────────
  ["bvn must be exactly 11 digits", "Your BVN must be exactly 11 digits."],
  ["bvn must be 11 digits", "Your BVN must be exactly 11 digits."],
  ["bvn lookup is only available during onboarding", "BVN can only be checked during onboarding."],
  ["too many bvn lookups", "Too many BVN attempts. Please wait a while and try again."],
  ["date of birth is required", "Please enter your date of birth."],
  ["at least bvn or nin is required", "Please provide your BVN or NIN to continue."],
  ["bvn error", "We couldn't verify your BVN. Please double-check it and try again."],
  ["upgrade failed", "We couldn't upgrade your account right now. Please try again shortly."],
  ["account creation failed", "We couldn't create your account right now. Please try again shortly."],
  ["invalid wallet token", "We couldn't complete your account setup because the banking connection needs to be refreshed. Please try again shortly."],
  ["account number is required for tier upgrade", "Please provide your account number to upgrade."],
  ["failed to upload", "We couldn't upload that file. Please try again."],
  ["upload failed", "We couldn't upload that file. Please try again."],
  ["invalid file", "Please choose a valid file."],
  ["image must be less than", "Please pick an image smaller than 5MB."],
  ["image too large", "That image is too large. Please choose one under 5MB."],
  ["file too large", "That file is too large. Please choose a smaller one."],
  ["please select an image file", "Please pick an image file (JPG or PNG)."],
  ["please choose an image", "Please choose an image to continue."],
  ["documents required", "Please upload all required documents to continue."],
  ["failed to upload image", "We couldn't upload that image. Please try again."],
  ["failed to remove profile picture", "We couldn't remove your profile picture. Please try again."],
  ["this username is already taken", "That username is taken. Please pick another."],
  ["failed to update username", "We couldn't update your username. Please try again."],
  ["failed to save profile", "We couldn't save your profile. Please try again."],

  // ─── Thrift Groups ──────────────────────────────────────────────────────
  ["only be a member of up to 2 active groups", "You can only be in 2 active groups at a time. Please complete or leave one first."],
  ["group not found", "We couldn't find that group."],
  ["group has already completed", "This group has already completed its cycle."],
  ["group has already started", "This group has already started — no new members can join."],
  ["group is full and waiting to start", "This group is full and waiting to start."],
  ["group is full", "This group is full — no new members can join."],
  ["you are already a member of this group", "You're already a member of this group."],
  ["already a member", "You're already a member of this group."],
  ["only the admin can commence", "Only the group admin can start this group."],
  ["only the admin can invite", "Only the group admin can invite members."],
  ["only the admin can update settings", "Only the group admin can change these settings."],
  ["only the admin can restart", "Only the group admin can restart this group."],
  ["only the group admin can", "Only the group admin can do that."],
  ["group has already commenced", "This group has already started."],
  ["member count mismatch", "The member list doesn't match. Please refresh and try again."],
  ["group is not active", "This group isn't active right now."],
  ["no active contribution cycle", "There's no active contribution cycle right now."],
  ["already contributed this cycle", "You've already contributed for this cycle."],
  ["no recipient for this cycle", "There's no recipient set for this cycle."],
  ["can only exit completed groups", "You can only exit a group once it has completed."],
  ["group is not completed", "This group hasn't completed yet."],
  ["not an active member", "You're no longer an active member of this group."],
  ["not a member", "You're not a member of this group."],
  ["not a member of this group", "You're not a member of this group."],
  ["you must be a member to contribute", "Join the group first to contribute."],
  ["only completed groups can restart", "Only completed groups can be restarted."],
  ["you must accept the terms", "Please accept the terms and conditions to continue."],
  ["this action is only available for completed groups", "This action is only available once the group has completed."],
  ["failed to load group", "We couldn't load this group right now. Please refresh and try again."],
  ["failed to commence thrift", "We couldn't start this group right now. Please try again."],
  ["failed to make contribution", "Your contribution didn't go through. Please try again."],
  ["failed to process payout", "We couldn't process that payout right now. Please try again."],
  ["failed to exit group", "We couldn't exit this group right now. Please try again."],
  ["failed to confirm continuation", "We couldn't confirm that right now. Please try again."],
  ["failed to confirm", "We couldn't confirm that right now. Please try again."],
  ["failed to restart group", "We couldn't restart this group right now. Please try again."],
  ["failed to send message", "Your message didn't send. Please check your connection and try again."],
  ["failed to update settings", "We couldn't update those settings. Please try again."],
  ["failed to update schedule", "We couldn't update the schedule. Please try again."],
  ["group name is required", "Please enter a group name."],
  ["please enter a group name", "Please enter a group name."],
  ["members must be between 2 and 30", "Group size must be between 2 and 30 members."],
  ["members must be between 3 and 20", "Group size must be between 3 and 20 members."],
  ["minimum contribution is", "The minimum contribution is ₦100."],
  ["contribution must be between", "Contribution must be between ₦5,000 and ₦500,000."],
  ["name and contribution amount required", "Please enter a group name and contribution amount."],

  // ─── Position Swap ──────────────────────────────────────────────────────
  ["group is not in a swap-eligible state", "Swaps aren't available for this group right now."],
  ["swap window has closed", "The swap window for this group has closed."],
  ["already used your swap", "You've already used your swap for this group."],
  ["cannot swap after receiving payout", "You can't swap after receiving your payout."],
  ["cannot swap after contributions have started", "You can't swap once this cycle's contributions have started."],
  ["target is not a member", "That user isn't a member of this group."],
  ["target has already received payout", "That user has already received their payout."],
  ["you already have a pending swap request", "You already have a pending swap request."],
  ["swap is no longer pending", "This swap request is no longer pending."],
  ["failed to send swap request", "We couldn't send that swap request. Please try again."],
  ["failed to respond to swap request", "We couldn't respond to that swap right now. Please try again."],

  // ─── SplitPay ───────────────────────────────────────────────────────────
  ["split is full", "This split is full. Ask the creator to remove a participant or create a larger split."],
  ["split not found", "We couldn't find that split."],
  ["split is not active", "This split isn't active anymore."],
  ["split has expired", "This split has expired."],
  ["split is not active", "This split isn't active anymore."],
  ["not a participant in this split", "You're not part of this split."],
  ["you have already paid", "You've already paid your share."],
  ["already paid your share", "You've already paid your share."],
  ["you have declined this split", "You've already declined this split."],
  ["payment blocked", "You don't have enough funds for this payment. Please top up your wallet first."],
  ["reminder could not be sent", "We couldn't send that reminder right now. Please try again."],
  ["could not decline", "We couldn't decline this split right now. Please try again."],
  ["could not cancel", "We couldn't cancel this split right now. Please try again."],
  ["could not remove", "We couldn't remove that participant. Please try again."],
  ["total bill must be at least ₦1,000", "The total bill must be at least ₦1,000."],
  ["need at least 2 participants", "You need at least 2 participants for a split."],
  ["missing merchant details", "Please fill in all merchant account fields."],
  ["fill in all merchant account fields", "Please fill in all merchant account fields."],
  ["bank not verified", "Please wait while we verify the bank account."],
  ["please wait for bank account verification", "Please wait while we verify the bank account."],

  // ─── Target Ajo ─────────────────────────────────────────────────────────
  ["target not found", "We couldn't find that target group."],
  ["target is not active", "This target group isn't active right now."],
  ["withdrawal requests are only for group mode", "Withdrawal requests are only available in group mode."],
  ["there is already a pending withdrawal", "There's already a pending withdrawal for this group."],
  ["no contributions to withdraw", "There are no contributions to withdraw yet."],
  ["withdrawal failed", "Your withdrawal didn't go through. Please try again."],
  ["failed to close group", "We couldn't close this group right now. Please try again."],
  ["failed to remove member", "We couldn't remove that member. Please try again."],
  ["failed to send reminders", "We couldn't send those reminders. Please try again."],
  ["failed to request withdrawal", "We couldn't submit that withdrawal request. Please try again."],
  ["cannot exceed amount raised", "You can't withdraw more than the amount raised."],
  ["failed to respond to invite", "We couldn't respond to that invite right now. Please try again."],
  ["search failed", "Search isn't responding right now. Please try again in a moment."],
  ["maximum", "You've reached the maximum allowed."],
  ["name is required", "Please enter a name to continue."],
  ["target must be at least ₦1,000", "Your target must be at least ₦1,000."],
  ["withdrawal amount must be at least", "The minimum withdrawal is ₦100."],
  ["contribution per member is too low", "That contribution is too low. Increase the target or reduce the number of members."],
  ["failed to create target", "We couldn't create that target right now. Please try again."],
  ["invite limit reached", "You've reached the invite limit for this group."],
  ["invite not found", "We couldn't find that invite."],
  ["invite already responded", "You've already responded to this invite."],
  ["user already invited", "That user has already been invited."],
  ["user is already a member", "That user is already a member."],
  ["user already has a pending invite", "That user already has a pending invite."],
  ["you already voted", "You've already voted on this withdrawal."],
  ["failed to vote", "We couldn't record your vote. Please try again."],
  ["failed to invite", "We couldn't send that invite. Please try again."],
  ["failed to contribute", "Your contribution didn't go through. Please try again."],
  ["contribution failed", "Your contribution didn't go through. Please try again."],

  // ─── Goal Funding ───────────────────────────────────────────────────────
  ["goal must be at least ₦1,000", "Your goal must be at least ₦1,000."],
  ["goal amount must be at least", "Your goal amount must be at least ₦1,000."],
  ["campaign title is required", "Please enter a title for your campaign."],
  ["beneficiary bank details are required", "Please add the beneficiary bank details."],
  ["failed to create campaign", "We couldn't create that campaign. Please try again."],
  ["failed to record contribution", "We couldn't record that contribution. Please try again."],
  ["failed to post update", "We couldn't post that update. Please try again."],
  ["failed to close campaign", "We couldn't close that campaign right now. Please try again."],
  ["create failed", "We couldn't create that right now. Please try again."],

  // ─── Invites / Groups / Tokenization ────────────────────────────────────
  ["failed to send invite", "We couldn't send that invite. Please try again."],
  ["failed to create invite link", "We couldn't create that invite link. Please try again."],
  ["failed to join group", "We couldn't join that group right now. Please try again."],
  ["invalid invite link", "That invite link isn't valid."],
  ["invite link has expired", "This invite link has expired."],
  ["invite link has reached max uses", "This invite link has reached its maximum uses."],
  ["failed to activate group", "We couldn't activate that group right now. Please try again."],
  ["failed to start card authorization", "We couldn't start the card setup. Please try again."],
  ["failed to recover card token", "We couldn't restore your saved card. Please add it again."],
  ["failed to accept terms", "We couldn't save your acceptance. Please try again."],
  ["verification failed", "We couldn't verify that. Please check your details and try again."],
  ["could not return an account name", "We couldn't find that account name. Please check the bank and account number."],

  // ─── Devices / Security ─────────────────────────────────────────────────
  ["device fingerprint is required", "We couldn't identify this device. Please try again."],
  ["device id is required", "Please select a device to continue."],
  ["failed to remove device", "We couldn't remove that device. Please try again."],
  ["failed to trust device", "We couldn't trust that device. Please try again."],
  ["please fill in all fields", "Please fill in all fields."],
  ["failed to update password", "We couldn't update your password. Please try again."],
  ["failed to delete account", "We couldn't delete your account. Please contact support."],
  ["email is required", "Please enter your email."],
  ["no email address found", "We don't have an email on file for your account. Please contact support."],

  // ─── Notifications ──────────────────────────────────────────────────────
  ["notifications blocked", "Notifications are blocked. Please enable them in your browser settings."],
  ["notification_id required", "Please select a notification to continue."],
  ["failed to respond", "We couldn't send your response. Please try again."],

  // ─── Support ────────────────────────────────────────────────────────────
  ["failed to submit ticket", "We couldn't submit your support ticket. Please try again."],
  ["message too long", "Your message is too long. Please shorten it and try again."],

  // ─── Rate limiting / nonces / general infra ─────────────────────────────
  ["too many requests", "Too many requests. Please wait a moment and try again."],
  ["request expired", "That took too long. Please try again."],
  ["duplicate request", "Looks like that was already submitted. Please check before trying again."],
  ["webhook not configured", "This feature isn't available right now. Please contact support."],
  ["network", "Connection issue. Please check your internet and try again."],
  ["timeout", "That took too long to respond. Please try again."],
  ["rate limit", "Too many requests. Please wait a moment and try again."],
  ["fetch failed", "Connection issue. Please check your internet and try again."],
  ["failed to fetch", "Connection issue. Please check your internet and try again."],
  ["network error", "Connection issue. Please check your internet and try again."],

  // ─── Vestara / Locks ────────────────────────────────────────────────────
  ["lock not found", "We couldn't find that lock."],
  ["lock is not active", "That lock isn't active anymore."],
  ["lock has not matured", "This lock hasn't matured yet. Use 'Break lock' for an early withdrawal."],
  ["no balance record", "Your balance isn't ready yet. Please sync your balance and try again."],
  ["invalid lock duration", "Please pick a valid lock duration."],
  ["invalid duration", "Please pick a valid duration."],
];

/**
 * Converts any error (Error object, string, or unknown) into a customer-friendly,
 * action-oriented message safe to show in a toast or UI.
 */
export function getUserFriendlyError(error: unknown): string {
  if (!error) return DEFAULT_MESSAGE;

  let raw: string;
  if (typeof error === "string") {
    raw = error;
  } else if (error instanceof Error) {
    raw = error.message;
  } else if (typeof error === "object" && error !== null) {
    const anyErr = error as { message?: unknown; error?: unknown };
    raw =
      (typeof anyErr.message === "string" && anyErr.message) ||
      (typeof anyErr.error === "string" && anyErr.error) ||
      "";
  } else {
    raw = String(error);
  }

  if (!raw || raw.trim().length === 0) return DEFAULT_MESSAGE;

  const lower = raw.toLowerCase();
  for (const [key, friendly] of ERROR_MAP) {
    if (lower.includes(key.toLowerCase())) return friendly;
  }

  // If the raw message is already short and human (no stack-trace / id / json), keep it.
  const looksTechnical =
    /[{}\[\]<>]|stack|undefined|null is not|cannot read|at .* \(|0x[a-f0-9]|edge function|non-2xx|supabase|postgres|pgrst|rpc|sql|relation |column |violates|constraint|function .*does not exist|schema|jwt|token|http ?\d{3}|status code|\b[45]\d\d\b|exception|typeerror|referenceerror|syntaxerror|internal server|vfd|nibss|api|payload|json|uuid|[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw) ||
    /\b[A-Z]{2,}(_[A-Z0-9]+)+\b/.test(raw) ||
    raw.length > 160;

  return looksTechnical ? DEFAULT_MESSAGE : raw;
}

/**
 * Convenience for sonner / use-toast destructive messages.
 */
export function toastError(error: unknown): string {
  return getUserFriendlyError(error);
}

/** Returns a customer-safe message for any toast text; friendly text passes through unchanged. */
export function sanitizeUserMessage(text: unknown): unknown {
  if (typeof text !== "string" || !text.trim()) return text;
  return getUserFriendlyError(text);
}
