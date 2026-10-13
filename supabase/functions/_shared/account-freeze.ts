// Shared admin-freeze enforcement. A frozen or suspended customer can still
// view balances/history but cannot start any money-moving action.
// deno-lint-ignore no-explicit-any
type Db = any;

export const FROZEN_MESSAGE =
  "Your account is currently on hold. Please contact support@vestara.ng to restore access.";

const MONEY_ACTIONS = new Set<string>([
  // vfd-banking
  "transfer", "create_lock", "unlock_funds", "break_lock",
  // vfd-sandbox-products
  "create_group", "join_group", "commence_group", "contribute_group", "settle_member_outstanding",
  "clear_missed_contribution", "join_group_via_link", "respond_group_invite", "accept_group_mandate",
  "trigger_mandate_debit", "accept_target_mandate", "create_target", "contribute_target",
  "request_target_withdrawal", "independent_withdrawal", "create_campaign", "contribute_campaign",
  "withdraw_campaign_escrow", "create_split", "join_split", "pay_split", "cover_split_shares",
  "create_association", "join_association", "contribute_association", "bills_pay",
  "create_recurring_bill", "create_virtual_card", "activate_card", "unblock_card",
  // vestara-ledger
  "withdraw", "transfer_initiate", "lock_funds", "thrift_contribute", "split_pay",
  "crowdfund_contribute", "create_savings", "retry_savings_funding", "early_withdraw_savings",
  "goalsave_v2_create", "goalsave_v2_authorize_mandate",
]);

export function isMoneyAction(action: unknown): boolean {
  return typeof action === "string" && MONEY_ACTIONS.has(action);
}

// Outflows paused while an admin has flagged the customer for risk review.
const RISK_OUTFLOWS = new Set<string>([
  "transfer", "withdraw", "transfer_initiate", "independent_withdrawal",
  "withdraw_campaign_escrow", "early_withdraw_savings", "break_lock",
]);

/** True when an admin freeze/suspension (or risk flag, for outflows) blocks this action. */
export async function isAccountFrozen(db: Db, userId: string, action?: unknown): Promise<boolean> {
  const { data } = await db.from("profiles").select("account_status, risk_level").eq("id", userId).maybeSingle();
  const s = (data?.account_status ?? "active") as string;
  if (s === "frozen" || s === "suspended") return true;
  return data?.risk_level === "high" && typeof action === "string" && RISK_OUTFLOWS.has(action);
}
