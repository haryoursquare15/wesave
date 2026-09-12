import { useCallback, useEffect, useState } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/errorMessages";

export type SpendLockPeriod = "daily" | "weekly" | "monthly";
export type SpendLockUnlockMode = "instant" | "cooling_off";

export interface SpendLockRule {
  id: string;
  period_type: SpendLockPeriod;
  limit_amount: number;
  reset_day: number | null;
  unlock_mode: SpendLockUnlockMode;
  cooling_off_minutes: number;
  status: "active" | "paused";
}

export interface SpendLockPendingUnlock {
  id: string;
  amount: number;
  reason: string | null;
  cooling_off_expires_at: string | null;
}

export interface SpendLockStatus {
  active: boolean;
  rule: SpendLockRule | null;
  period?: { id: string; period_start: string; period_end: string; limit_amount: number } | null;
  spent_amount?: number;
  unlocked_amount?: number;
  disposable_remaining?: number;
  pending_unlocks?: SpendLockPendingUnlock[];
}

/** SpendLock — voluntary spending limit. Informational only: nothing is blocked. */
export function useSpendLock() {
  const { session, client: supabase } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<SpendLockStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown> = {}, silent = false) => {
      if (!session) return null;
      setLoading(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc(fn, args);
        if (error) {
          if (!silent) {
            toast({
              title: "SpendLock",
              description: getUserFriendlyError(error.message),
              variant: "destructive",
            });
          }
          return null;
        }
        const next = data as SpendLockStatus;
        setStatus(next);
        return next;
      } finally {
        setLoading(false);
      }
    },
    [session, supabase, toast]
  );

  const refresh = useCallback(() => call("budget_get_status", {}, true), [call]);

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  const setRule = useCallback(
    (
      periodType: SpendLockPeriod,
      limitAmount: number,
      resetDay: number | null,
      unlockMode: SpendLockUnlockMode,
      coolingOffMinutes = 30
    ) =>
      call("budget_set_rule", {
        _period_type: periodType,
        _limit_amount: limitAmount,
        _reset_day: resetDay,
        _unlock_mode: unlockMode,
        _cooling_off_minutes: coolingOffMinutes,
      }),
    [call]
  );

  const pause = useCallback(() => call("budget_set_status", { _status: "paused" }), [call]);
  const resume = useCallback(() => call("budget_set_status", { _status: "active" }), [call]);
  const removeRule = useCallback(() => call("budget_delete_rule", {}), [call]);
  const requestUnlock = useCallback(
    (amount: number, reason?: string) =>
      call("budget_request_unlock", { _amount: amount, _reason: reason ?? null }),
    [call]
  );
  const cancelUnlock = useCallback(
    (id: string) => call("budget_cancel_unlock", { _unlock_id: id }),
    [call]
  );

  return { status, loading, refresh, setRule, pause, resume, removeRule, requestUnlock, cancelUnlock };
}
