import { useMemo, useState } from "react";
import { subDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarClock, TrendingUp, Wallet, Activity, Check, ArrowUpRight, ReceiptText, PiggyBank, Users, Lightbulb, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSpendLockInsights } from "@/hooks/useSpendLockInsights";
import { useSpendLock } from "@/hooks/useSpendLock";

const naira = (n: number) =>
  `₦${Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

const daysUntil = (date: string) =>
  Math.round((new Date(date).getTime() - Date.now()) / 86400000);

const dueLabel = (date: string | null) => {
  if (!date) return "Date not clear yet";
  const d = daysUntil(date);
  if (d < 0) return "Overdue";
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d} days`;
};

const cadenceLabel = (c: string | null) =>
  c === "weekly" ? "Every week" : c === "monthly" ? "Every month" : c === "daily" ? "Every day" : "Repeating";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Full breakdown of a customer's spending analysis. Read-only, closes back to the dashboard. */
export function SpendLockInsightsDetail({ open, onOpenChange }: Props) {
  const { insights, loading, refresh, confirmBill, dismissBill, resolveSuggestion } = useSpendLockInsights();
  const { status } = useSpendLock();
  const [range, setRange] = useState<DateRange>({ from: subDays(new Date(), 89), to: new Date() });

  const applyRange = async (next: DateRange | undefined) => {
    if (!next?.from) return;
    const complete = { from: next.from, to: next.to ?? next.from };
    setRange(complete);
    if (complete.to) await refresh(format(complete.from, "yyyy-MM-dd"), format(complete.to, "yyyy-MM-dd"));
  };

  const bills = useMemo(
    () =>
      [...(insights?.bills ?? [])]
        .filter((b) => b.status !== "dismissed")
        .sort((a, b) => {
          const av = a.next_expected_date ? daysUntil(a.next_expected_date) : 999;
          const bv = b.next_expected_date ? daysUntil(b.next_expected_date) : 999;
          return av - bv;
        }),
    [insights]
  );
  const income = insights?.income ?? [];
  const suggestions = (insights?.suggestions ?? []).filter((s) => s.status === "pending");
  const frequentTransfers = insights?.frequent_transfers ?? [];
  const frequentBills = insights?.frequent_bill_payments ?? [];
  const investments = insights?.investments ?? {};
  const ajo = insights?.ajo ?? {};
  const stats = insights?.stats ?? {};
  const history = insights?.budget_history ?? {};
  const advice = insights?.advice ?? [];

  const avgWeekly = Number(stats.avg_weekly_spend ?? 0);
  const monthlyBills = bills
    .filter((b) => b.status === "confirmed" || (b.confidence ?? 0) >= 0.5)
    .reduce((sum, b) => {
      const amt = Number(b.amount_estimate || 0);
      const mult = b.cadence === "weekly" ? 4 : b.cadence === "daily" ? 30 : 1;
      return sum + amt * mult;
    }, 0);
  const remaining = Number(status?.disposable_remaining ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[100dvh] w-screen max-w-md gap-0 overflow-x-hidden overflow-y-auto rounded-none border-[hsl(var(--spendlock-border))] bg-[hsl(var(--spendlock-surface))] p-0 text-[hsl(var(--spendlock-foreground))] [&>button]:bg-[hsl(var(--spendlock-surface-soft))] [&>button]:text-[hsl(var(--spendlock-foreground))] sm:h-auto sm:max-h-[85vh] sm:w-full sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 border-b border-[hsl(var(--spendlock-border))] bg-[hsl(var(--spendlock-surface))] px-4 py-4 pr-14 sm:px-5">
          <h2 className="text-base font-semibold">Your spending breakdown</h2>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="mt-1 h-auto max-w-full justify-start p-0 text-left text-xs font-normal text-[hsl(var(--spendlock-muted))] hover:bg-transparent hover:text-[hsl(var(--spendlock-foreground))]">
                <CalendarDays className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-normal">{range.from && range.to ? `${format(range.from, "d MMM yyyy")} – ${format(range.to, "d MMM yyyy")}` : "Choose dates"}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] p-0" align="start">
              <Calendar mode="range" selected={range} onSelect={applyRange} disabled={{ after: new Date() }} numberOfMonths={1} initialFocus className={cn("pointer-events-auto p-2")} />
            </PopoverContent>
          </Popover>
        </div>


        <div className={cn("space-y-5 px-4 py-5 sm:px-5", loading && "opacity-70")}>
          {/* Headline numbers */}
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            {[
              { icon: TrendingUp, label: "Average weekly spend", value: naira(avgWeekly) },
              { icon: CalendarClock, label: "Repeating payments a month", value: naira(monthlyBills) },
              { icon: Activity, label: "Payments made", value: `${Number(stats.debit_count_90d ?? 0)}` },
              { icon: Wallet, label: "Left to spend", value: status?.rule ? naira(remaining) : "No limit set" },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-xl bg-[hsl(var(--spendlock-surface-soft))] p-4">
                <item.icon className="h-4 w-4 text-primary" />
                <p className="mt-2 text-[11px] leading-tight text-[hsl(var(--spendlock-muted))]">{item.label}</p>
                <p className="mt-1 break-words text-base font-bold tabular-nums sm:text-lg">{item.value}</p>
              </div>
            ))}
          </div>

          {stats.spend_volatility && (
            <p className="text-xs leading-relaxed text-[hsl(var(--spendlock-muted))]">
              Your spending is{" "}
              <span className="font-semibold text-[hsl(var(--spendlock-foreground))]">{stats.spend_volatility}</span> from
              week to week.
            </p>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase text-[hsl(var(--spendlock-muted))]">Your money picture</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <div className="rounded-xl bg-[hsl(var(--spendlock-surface-soft))] p-4">
                <PiggyBank className="h-4 w-4 text-primary" />
                <p className="mt-2 text-[11px] text-[hsl(var(--spendlock-muted))]">Active investments</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{naira(Number(investments.total ?? 0))}</p>
                <p className="mt-1 text-[10px] text-[hsl(var(--spendlock-muted))]">{Number(investments.active_count ?? 0)} active plan{Number(investments.active_count ?? 0) === 1 ? "" : "s"}</p>
              </div>
              <div className="rounded-xl bg-[hsl(var(--spendlock-surface-soft))] p-4">
                <Users className="h-4 w-4 text-primary" />
                <p className="mt-2 text-[11px] text-[hsl(var(--spendlock-muted))]">Ajo participation</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{Number(ajo.active_groups ?? 0)} active</p>
                <p className="mt-1 text-[10px] text-[hsl(var(--spendlock-muted))]">{naira(Number(ajo.total_contributed ?? 0))} contributed</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase text-[hsl(var(--spendlock-muted))]">Frequently transferred to</h3>
            {frequentTransfers.length === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--spendlock-muted))]">No repeated transfer recipient spotted in the last 90 days.</p>
            ) : (
              <div className="mt-3 divide-y divide-[hsl(var(--spendlock-border))] overflow-hidden rounded-xl bg-[hsl(var(--spendlock-surface-soft))]">
                {frequentTransfers.map((recipient, index) => (
                  <div key={`${recipient.account ?? recipient.name}-${index}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><ArrowUpRight className="h-4 w-4 text-primary" /></span>
                    <div className="min-w-0 flex-1">
                       <p className="break-words text-sm font-semibold">{recipient.name}</p>
                       <p className="mt-0.5 break-words text-[11px] leading-relaxed text-[hsl(var(--spendlock-muted))]">{recipient.transfer_count} transfer{recipient.transfer_count === 1 ? "" : "s"} · {naira(Number(recipient.total_amount))}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase text-[hsl(var(--spendlock-muted))]">Frequent bill payments</h3>
            {frequentBills.length === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--spendlock-muted))]">No repeated bill payment spotted in the last 90 days.</p>
            ) : (
              <div className="mt-3 divide-y divide-[hsl(var(--spendlock-border))] overflow-hidden rounded-xl bg-[hsl(var(--spendlock-surface-soft))]">
                {frequentBills.map((bill, index) => (
                  <div key={`${bill.name}-${index}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><ReceiptText className="h-4 w-4 text-primary" /></span>
                    <div className="min-w-0 flex-1">
                       <p className="break-words text-sm font-semibold">{bill.name}</p>
                       <p className="mt-0.5 break-words text-[11px] leading-relaxed text-[hsl(var(--spendlock-muted))]">{bill.payment_count} payment{bill.payment_count === 1 ? "" : "s"} · {naira(Number(bill.total_amount))}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Repeating payments */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-[hsl(var(--spendlock-muted))]">Repeating payments</h3>
            {bills.length === 0 ? (
              <p className="mt-2 text-xs text-[hsl(var(--spendlock-muted))]">
                None spotted yet. They appear once a payment repeats a few times.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {bills.map((b) => (
                  <div key={b.id} className="rounded-xl bg-[hsl(var(--spendlock-surface-soft))] p-4">
                     <div className="flex flex-col gap-2 min-[360px]:flex-row min-[360px]:items-start min-[360px]:justify-between">
                       <div className="min-w-0 flex-1">
                         <p className="break-words text-sm font-semibold">{b.label || b.counterparty_hint || "Recurring payment"}</p>
                         <p className="mt-1 break-words text-[11px] leading-relaxed text-[hsl(var(--spendlock-muted))]">
                          {cadenceLabel(b.cadence)} · {dueLabel(b.next_expected_date)}
                          {b.occurrences ? ` · seen ${b.occurrences} times` : ""}
                        </p>
                      </div>
                       <p className="text-sm font-bold tabular-nums min-[360px]:shrink-0">{naira(Number(b.amount_estimate || 0))}</p>
                    </div>
                    {b.status === "suggested" && (
                       <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                        <Button size="sm" variant="outline" className="min-h-[40px] flex-1 border-[hsl(var(--spendlock-border))] bg-transparent text-xs text-[hsl(var(--spendlock-foreground))] hover:bg-[hsl(var(--spendlock-surface))]" onClick={() => confirmBill(b.id)}>
                          <Check className="mr-1.5 h-3.5 w-3.5" /> That's right
                        </Button>
                        <Button size="sm" variant="ghost" className="min-h-[40px] flex-1 text-xs" onClick={() => dismissBill(b.id)}>
                          Not a bill
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Money coming in */}
          {income.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-[hsl(var(--spendlock-muted))]">Money coming in</h3>
              <div className="mt-3 space-y-2">
                {income.slice(0, 5).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl bg-[hsl(var(--spendlock-surface-soft))] px-4 py-3">
                    <p className="text-xs text-[hsl(var(--spendlock-muted))]">{cadenceLabel(i.cadence)}</p>
                    <p className="text-sm font-semibold tabular-nums">{naira(Number(i.amount || 0))}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Limit history */}
          {status?.rule && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-[hsl(var(--spendlock-muted))]">How you're keeping to it</h3>
               <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3 min-[360px]:gap-3 min-[360px]:text-center">
                {[
                  { label: "Periods done", value: Number(history.periods_closed ?? 0) },
                  { label: "Times over", value: Number(history.weeks_over_limit ?? 0) },
                  { label: "Top-ups", value: Number(history.unlock_count ?? 0) },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-[hsl(var(--spendlock-surface-soft))] p-3">
                    <p className="text-lg font-bold tabular-nums">{s.value}</p>
                    <p className="mt-1 text-[10px] leading-tight text-[hsl(var(--spendlock-muted))]">{s.label}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {advice.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-[hsl(var(--spendlock-muted))]">Ideas to grow your money</h3>
              <div className="mt-3 space-y-2">
                {advice.map((item, index) => (
                  <div key={`${item.type}-${index}`} className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <p className="break-words text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 break-words text-xs leading-relaxed text-[hsl(var(--spendlock-muted))]">{item.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-[hsl(var(--spendlock-muted))]">Ideas for you</h3>
              <div className="mt-3 space-y-2">
                {suggestions.map((s) => (
                  <div key={s.id} className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <p className="text-sm font-semibold">{s.payload?.headline || "A limit that fits your spending"}</p>
                    {s.payload?.reasoning && (
                      <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--spendlock-muted))]">{s.payload.reasoning}</p>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 min-h-[40px] text-xs"
                      onClick={() => resolveSuggestion(s.id, "dismissed")}
                    >
                      Dismiss
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-primary/30 bg-primary/10 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15"><Lightbulb className="h-4 w-4 text-primary" /></span>
               <div className="min-w-0">
                <h3 className="text-sm font-semibold">Your overview</h3>
                 <p className="mt-1 break-words text-xs leading-relaxed text-[hsl(var(--spendlock-muted))]">
                  {insights?.overview || "Keep enough money available for regular bills, then move what is left into savings that match your timeline."}
                </p>
              </div>
            </div>
          </section>

          <Button variant="outline" className="min-h-[44px] w-full border-[hsl(var(--spendlock-border))] bg-[hsl(var(--spendlock-surface-soft))] text-[hsl(var(--spendlock-foreground))] hover:bg-[hsl(var(--spendlock-border))] hover:text-[hsl(var(--spendlock-foreground))]" onClick={() => onOpenChange(false)}>
            Back to dashboard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
