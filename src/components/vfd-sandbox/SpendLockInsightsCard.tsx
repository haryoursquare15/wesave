import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, CalendarClock, TrendingUp, Check, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpendLockInsights } from "@/hooks/useSpendLockInsights";
import { useSpendLock } from "@/hooks/useSpendLock";

const naira = (n: number) =>
  `₦${Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

const daysUntil = (date: string) =>
  Math.round((new Date(date).getTime() - Date.now()) / 86400000);

/**
 * Read-only insight card: upcoming recurring bills, spending pattern and the
 * AI limit suggestion. Nothing here moves money or changes a limit on its own.
 */
export function SpendLockInsightsCard() {
  const {
    insights,
    suggesting,
    confirmBill,
    dismissBill,
    resolveSuggestion,
    requestSuggestion,
  } = useSpendLockInsights();
  const { status, setRule } = useSpendLock();
  const [busy, setBusy] = useState(false);

  const remaining = Number(status?.disposable_remaining ?? 0);
  const hasRule = !!status?.rule;

  const upcoming = useMemo(
    () =>
      (insights?.bills ?? [])
        .filter((b) => b.next_expected_date && daysUntil(b.next_expected_date) <= 14)
        .sort((a, b) => daysUntil(a.next_expected_date!) - daysUntil(b.next_expected_date!))
        .slice(0, 3),
    [insights]
  );

  const suggestion = (insights?.suggestions ?? []).find(
    (s) => s.suggestion_type === "set_limit" || s.suggestion_type === "adjust_limit"
  );
  const avgWeekly = Number(insights?.stats?.avg_weekly_spend ?? 0);
  const volatility = insights?.stats?.spend_volatility;

  const acceptSuggestion = async () => {
    if (!suggestion) return;
    const amount = Number(suggestion.payload?.suggested_limit || 0);
    const period = suggestion.payload?.period_type || "weekly";
    if (!amount) return;
    setBusy(true);
    try {
      await setRule(period, amount, period === "daily" ? null : 1, status?.rule?.unlock_mode ?? "instant", 30);
      await resolveSuggestion(suggestion.id, "accepted");
    } finally {
      setBusy(false);
    }
  };

  const nothingToShow = !upcoming.length && !suggestion && avgWeekly <= 0;
  if (!insights || nothingToShow) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-xl border border-border bg-card px-3.5 py-3 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" /> Spending insights
        </p>
        <button
          onClick={() => requestSuggestion()}
          disabled={suggesting}
          className="p-1.5 -m-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="Refresh suggestion"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${suggesting ? "animate-spin" : ""}`} />
        </button>
      </div>

      {avgWeekly > 0 && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          <span>
            You spend about <span className="font-semibold text-foreground">{naira(avgWeekly)}</span> a
            week
            {volatility === "high"
              ? ", and it swings a lot week to week."
              : volatility === "medium"
              ? ", with some ups and downs."
              : ", fairly steadily."}
          </span>
        </p>
      )}

      {upcoming.map((bill) => {
        const days = daysUntil(bill.next_expected_date!);
        const amount = Number(bill.amount_estimate || 0);
        const willStretch = hasRule && remaining > 0 && amount > remaining;
        return (
          <div key={bill.id} className="rounded-lg bg-muted/50 px-3 py-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold flex items-center gap-1.5 min-w-0">
                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{bill.label || "Recurring payment"}</span>
              </p>
              <span className="text-xs font-bold shrink-0">{naira(amount)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Usually paid {bill.cadence === "weekly" ? "every week" : bill.cadence === "monthly" ? "every month" : "now and then"} ·{" "}
              {days <= 0 ? "due around now" : days === 1 ? "due tomorrow" : `due in ${days} days`}
            </p>
            {hasRule && (
              <p className={`text-[11px] ${willStretch ? "text-destructive" : "text-muted-foreground"}`}>
                This will use {naira(amount)} of your {naira(remaining)} left
                {willStretch ? " — more than you have set aside." : "."}
              </p>
            )}
            {bill.status === "suggested" && (
              <div className="flex gap-2 pt-0.5">
                <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => confirmBill(bill.id)}>
                  <Check className="h-3 w-3 mr-1" /> That's right
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => dismissBill(bill.id)}>
                  <X className="h-3 w-3 mr-1" /> Not a bill
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {suggestion ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-semibold">
            {suggestion.payload?.headline || "A limit that fits your spending"}
          </p>
          <p className="text-[11px] text-muted-foreground">{suggestion.payload?.reasoning}</p>
          <p className="text-sm font-extrabold">
            {naira(Number(suggestion.payload?.suggested_limit || 0))}{" "}
            <span className="text-[11px] font-medium text-muted-foreground">
              {suggestion.payload?.period_type === "daily"
                ? "a day"
                : suggestion.payload?.period_type === "monthly"
                ? "a month"
                : "a week"}
            </span>
          </p>
          <div className="flex gap-2 pt-0.5">
            <Button size="sm" className="h-8 flex-1 text-[11px]" onClick={acceptSuggestion} disabled={busy}>
              Use this limit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[11px]"
              onClick={() => resolveSuggestion(suggestion.id, "dismissed")}
            >
              No thanks
            </Button>
          </div>
        </div>
      ) : (
        avgWeekly > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-9 text-[11px]"
            onClick={() => requestSuggestion()}
            disabled={suggesting}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            {suggesting ? "Working out a limit…" : hasRule ? "Suggest a better limit" : "Suggest a limit for me"}
          </Button>
        )
      )}
    </motion.div>
  );
}
