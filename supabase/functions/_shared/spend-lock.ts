import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface SpendLockDecision {
  allowed: boolean;
  remaining: number;
  required: number;
  periodType?: string;
}

/** Server-side SpendLock gate. A missing or paused rule never blocks spending. */
export async function checkSpendLock(
  admin: SupabaseClient,
  userId: string,
  amount: number,
): Promise<SpendLockDecision> {
  const { data: rule, error: ruleError } = await admin
    .from("budget_rules")
    .select("id, period_type, reset_day, limit_amount, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (ruleError) throw new Error(`SpendLock check failed: ${ruleError.message}`);
  if (!rule || rule.status !== "active") {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, required: amount };
  }

  const { data: windows, error: windowError } = await admin.rpc("budget_period_window", {
    _period_type: rule.period_type,
    _reset_day: rule.reset_day,
  });
  if (windowError) throw new Error(`SpendLock window failed: ${windowError.message}`);
  const window = Array.isArray(windows) ? windows[0] : windows;
  if (!window?.period_start || !window?.period_end) throw new Error("SpendLock window is unavailable");

  const { data: spent, error: spentError } = await admin.rpc("budget_spent_in_window", {
    _user: userId,
    _from: window.period_start,
    _to: window.period_end,
  });
  if (spentError) throw new Error(`SpendLock spending check failed: ${spentError.message}`);

  const { data: period } = await admin.from("budget_periods").select("id")
    .eq("rule_id", rule.id).eq("period_start", window.period_start).maybeSingle();
  let unlocked = 0;
  if (period?.id) {
    const { data: unlocks, error: unlockError } = await admin.from("budget_unlocks")
      .select("amount, status, cooling_off_expires_at").eq("period_id", period.id)
      .in("status", ["confirmed", "pending"]);
    if (unlockError) throw new Error(`SpendLock unlock check failed: ${unlockError.message}`);
    unlocked = (unlocks || []).reduce((total, unlock) => {
      const ready = unlock.status === "confirmed" ||
        (unlock.status === "pending" && unlock.cooling_off_expires_at &&
          new Date(unlock.cooling_off_expires_at).getTime() <= Date.now());
      return ready ? total + Number(unlock.amount || 0) : total;
    }, 0);
  }

  const remaining = Math.max(0, Number(rule.limit_amount) + unlocked - Number(spent || 0));
  return { allowed: amount <= remaining, remaining, required: amount, periodType: String(rule.period_type) };
}