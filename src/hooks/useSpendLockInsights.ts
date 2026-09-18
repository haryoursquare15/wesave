import { useCallback, useEffect, useState } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/errorMessages";

export interface DetectedBill {
  id: string;
  label: string | null;
  counterparty_hint: string | null;
  amount_estimate: number | null;
  cadence: string | null;
  next_expected_date: string | null;
  confidence: number | null;
  occurrences: number | null;
  status: "suggested" | "confirmed" | "dismissed";
}

export interface IncomeEvent {
  id: string;
  amount: number | null;
  cadence: string | null;
  confidence: number | null;
  detected_at: string | null;
}

export interface BudgetSuggestion {
  id: string;
  suggestion_type: "set_limit" | "adjust_limit" | "pay_bill_reminder" | "category_insight";
  status: "pending" | "accepted" | "dismissed";
  payload: {
    period_type?: "daily" | "weekly" | "monthly";
    suggested_limit?: number;
    headline?: string;
    reasoning?: string;
  };
}

export interface SpendLockInsights {
  stats: { avg_weekly_spend?: number; spend_volatility?: string; debit_count_90d?: number; debit_count?: number; range_days?: number };
  bills: DetectedBill[];
  income: IncomeEvent[];
  suggestions: BudgetSuggestion[];
  budget_history: { periods_closed?: number; weeks_over_limit?: number; unlock_count?: number };
  frequent_transfers?: Array<{
    name: string;
    account: string | null;
    transfer_count: number;
    total_amount: number;
    last_sent_at: string | null;
  }>;
  frequent_bill_payments?: Array<{
    name: string;
    item: string | null;
    payment_count: number;
    total_amount: number;
    last_paid_at: string | null;
  }>;
  investments?: { total?: number; active_count?: number };
  ajo?: { groups_joined?: number; active_groups?: number; total_contributed?: number };
  wallet?: { available_balance?: number; idle_days?: number };
  airtime?: { total?: number; payment_count?: number };
  advice?: Array<{
    type: "idle_wallet" | "savings" | "ajo" | "airtime";
    title: string;
    message: string;
    action?: string;
    action_key?: string;
  }>;
  date_range?: { start?: string; end?: string; days?: number };
  overview?: string;
}

/**
 * SpendLock analytics. Layer 1 (bill/income detection, spend stats) is computed
 * in the database. Layer 2 (the AI suggestion) is requested on demand and is
 * always a suggestion — it never changes a limit by itself.
 */
export function useSpendLockInsights() {
  const { session, client: supabase } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [insights, setInsights] = useState<SpendLockInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown> = {}, silent = false) => {
      if (!session) return null;
      setLoading(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc(fn, args);
        if (error) {
          // Never fail silently: a dead button is worse than a clear message.
          if (!silent) {
            toast({
              title: "Spending insights",
              description: getUserFriendlyError(error.message),
              variant: "destructive",
            });
          }
          return null;
        }
        const next = data as SpendLockInsights;
        setInsights(next);
        return next;
      } finally {
        setLoading(false);
      }
    },
    [session, supabase, toast]
  );

  const refresh = useCallback(
    (startDate?: string, endDate?: string) =>
      call("spendlock_get_insights", {
        _start_date: startDate ?? new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10),
        _end_date: endDate ?? new Date().toISOString().slice(0, 10),
      }),
    [call]
  );

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  const confirmBill = useCallback(
    (id: string) => call("spendlock_update_bill", { _bill_id: id, _status: "confirmed" }),
    [call]
  );
  const dismissBill = useCallback(
    (id: string) => call("spendlock_update_bill", { _bill_id: id, _status: "dismissed" }),
    [call]
  );
  const renameBill = useCallback(
    (id: string, label: string) => call("spendlock_update_bill", { _bill_id: id, _label: label }),
    [call]
  );
  const resolveSuggestion = useCallback(
    (id: string, status: "accepted" | "dismissed") =>
      call("spendlock_resolve_suggestion", { _suggestion_id: id, _status: status }),
    [call]
  );

  /** Ask for a fresh AI-generated limit suggestion (numbers only are sent). */
  const requestSuggestion = useCallback(async () => {
    if (!session) return null;
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("spendlock-suggest", { body: {} });
      if (error) {
        toast({
          title: "Suggestions unavailable",
          description: getUserFriendlyError(error.message),
          variant: "destructive",
        });
        return null;
      }
      const suggestion = (data as { suggestion?: BudgetSuggestion | null })?.suggestion ?? null;
      if (!suggestion) {
        toast({
          title: "Not enough history yet",
          description: "Spend a little more from this wallet and we can suggest a limit.",
        });
      }
      await refresh();
      return suggestion;
    } finally {
      setSuggesting(false);
    }
  }, [session, supabase, toast, refresh]);

  return {
    insights,
    loading,
    suggesting,
    refresh,
    confirmBill,
    dismissBill,
    renameBill,
    resolveSuggestion,
    requestSuggestion,
  };
}
