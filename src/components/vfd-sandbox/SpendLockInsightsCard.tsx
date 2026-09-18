import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, CalendarClock, TrendingUp, Check, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpendLockInsights } from "@/hooks/useSpendLockInsights";
import { useSpendLock } from "@/hooks/useSpendLock";
import { SpendLockInsightsDetail } from "@/components/vfd-sandbox/SpendLockInsightsDetail";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

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

  const acceptSuggestion = async () => {
    if (!suggestion) return;
    const amount = Number(suggestion.payload?.suggested_limit || 0);
    const period = suggestion.payload?.period_type || "weekly";
    if (!amount) return;
    setBusy(true);
    try {
      const applied = await setRule(
        period,
        amount,
        period === "daily" ? null : 1,
        status?.rule?.unlock_mode ?? "instant",
        30
      );
      if (!applied) return;
      await resolveSuggestion(suggestion.id, "accepted");
      toast({
        title: "Limit updated",
        description: `Your ${period === "daily" ? "daily" : period === "monthly" ? "monthly" : "weekly"} limit is now ${naira(amount)}.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const dismissSuggestion = async () => {
    if (!suggestion) return;
    setBusy(true);
    try {
      await resolveSuggestion(suggestion.id, "dismissed");
    } finally {
      setBusy(false);
    }
  };

  const nothingToShow = !upcoming.length && !suggestion && avgWeekly <= 0;
  const nextBill = upcoming[0];

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full overflow-hidden rounded-2xl border border-[hsl(var(--spendlock-border))] bg-[hsl(var(--spendlock-surface))] p-5 text-[hsl(var(--spendlock-foreground))] shadow-sm"
    >
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setDetailOpen(true)} className="min-w-0 text-left">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase text-[hsl(var(--spendlock-muted))]">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Spending insights
          </p>
          <p className="mt-1 text-sm text-[hsl(var(--spendlock-muted))]">Tap for your full breakdown</p>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => requestSuggestion()}
          disabled={suggesting}
          className="h-10 w-10 shrink-0 text-[hsl(var(--spendlock-muted))] hover:bg-[hsl(var(--spendlock-surface-soft))] hover:text-[hsl(var(--spendlock-foreground))]"
          aria-label="Refresh suggestion"
        >
          <RefreshCw className={`h-4 w-4 ${suggesting ? "animate-spin" : ""}`} />
        </Button>
      </div>


      {avgWeekly > 0 && (
        <div className="mt-5 flex items-center justify-between gap-4 border-b border-[hsl(var(--spendlock-border))] pb-4">
          <div>
            <p className="text-xs text-[hsl(var(--spendlock-muted))]">Average weekly spend</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{naira(avgWeekly)}</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--spendlock-surface-soft))]">
            <TrendingUp className="h-5 w-5 text-primary" />
          </span>
        </div>
      )}

      {nothingToShow && (
        <div className="mt-5 flex items-center gap-4 rounded-xl bg-[hsl(var(--spendlock-surface-soft))] p-4">
          <div className="flex h-10 items-end gap-1" aria-hidden="true">
            {[35, 55, 42, 76].map((height, index) => (
              <span key={index} className="w-1.5 rounded-full bg-primary/60" style={{ height: `${height}%` }} />
            ))}
          </div>
          <div>
            <p className="text-sm font-semibold">Your pattern is taking shape</p>
            <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--spendlock-muted))]">Insights will appear as you make payments.</p>
          </div>
        </div>
      )}

      {nextBill && (() => {
        const days = daysUntil(nextBill.next_expected_date!);
        const amount = Number(nextBill.amount_estimate || 0);
        const willStretch = hasRule && remaining > 0 && amount > remaining;
        return (
          <div className="mt-4 rounded-xl bg-[hsl(var(--spendlock-surface-soft))] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <CalendarClock className="h-4 w-4 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{nextBill.label || "Recurring payment"}</p>
                  <p className="mt-1 text-xs text-[hsl(var(--spendlock-muted))]">
                    {days <= 0 ? "Due around now" : days === 1 ? "Due tomorrow" : `Due in ${days} days`}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-sm font-bold tabular-nums">{naira(amount)}</p>
            </div>
            {hasRule && (
              <p className={`mt-3 border-t border-[hsl(var(--spendlock-border))] pt-3 text-xs leading-relaxed ${willStretch ? "text-destructive" : "text-[hsl(var(--spendlock-muted))]"}`}>
                {willStretch ? "This payment is above your available SpendLock amount." : `${naira(remaining - amount)} will remain after this payment.`}
              </p>
            )}
            {nextBill.status === "suggested" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" className="min-h-[40px] flex-1 border-[hsl(var(--spendlock-border))] bg-transparent text-xs text-[hsl(var(--spendlock-foreground))] hover:bg-[hsl(var(--spendlock-surface))]" onClick={() => confirmBill(nextBill.id)}>
                  <Check className="mr-1.5 h-3.5 w-3.5" /> That's right
                </Button>
                <Button size="sm" variant="ghost" className="min-h-[40px] flex-1 text-xs" onClick={() => dismissBill(nextBill.id)}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Not a bill
                </Button>
              </div>
            )}
          </div>
        );
      })()}

      {upcoming.length > 1 && (
        <p className="mt-3 text-xs text-[hsl(var(--spendlock-muted))]">+{upcoming.length - 1} more upcoming payment{upcoming.length > 2 ? "s" : ""}</p>
      )}

      {suggestion ? (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
          <p className="text-sm font-semibold">
            {suggestion.payload?.headline || "A limit that fits your spending"}
          </p>
          <p className="text-xs leading-relaxed text-[hsl(var(--spendlock-muted))]">{suggestion.payload?.reasoning}</p>
          <p className="text-lg font-bold">
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
            <Button size="sm" className="min-h-[40px] flex-1 text-xs" onClick={acceptSuggestion} disabled={busy}>
              Use this limit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-[40px] text-xs"
              onClick={dismissSuggestion}
              disabled={busy}
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
            className="mt-4 min-h-[44px] w-full border-[hsl(var(--spendlock-border))] bg-transparent text-xs text-[hsl(var(--spendlock-foreground))] hover:bg-[hsl(var(--spendlock-surface-soft))] hover:text-[hsl(var(--spendlock-foreground))]"
            onClick={() => requestSuggestion()}
            disabled={suggesting}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            {suggesting ? "Working out a limit…" : hasRule ? "Suggest a better limit" : "Suggest a limit for me"}
          </Button>
        )
      )}
      <Button
        variant="ghost"
        className="mt-3 min-h-[44px] w-full text-xs text-[hsl(var(--spendlock-muted))] hover:bg-[hsl(var(--spendlock-surface-soft))] hover:text-[hsl(var(--spendlock-foreground))]"
        onClick={() => setDetailOpen(true)}
      >
        See full breakdown
      </Button>
    </motion.div>
    <SpendLockInsightsDetail open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );

}
