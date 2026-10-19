import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { Activity, ArrowRight, ArrowUpRight, ChevronRight, Flame, Lightbulb, PiggyBank, ReceiptText, RefreshCw, ShieldCheck, ChartNoAxesCombined, TrendingUp, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SpendLockInsightsDetail } from "./SpendLockInsightsDetail";
import { useVestaraInsights, type MoneyInsight } from "@/hooks/useVestaraInsights";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const pillars = [
  { key: "save", label: "Save", icon: PiggyBank, color: "text-insights-save", bar: "bg-insights-save", tint: "bg-insights-save/10", description: "Your savings habits", invitation: "A small savings goal is one way to get started.", action: "Explore savings", view: "lock" },
  { key: "circle", label: "Circle", icon: Users, color: "text-insights-circle", bar: "bg-insights-circle", tint: "bg-insights-circle/10", description: "Showing up together", invitation: "Consider a thrift circle or settling a shared bill.", action: "Explore Thrift", view: "ajo" },
  { key: "grow", label: "Grow", icon: TrendingUp, color: "text-insights-grow", bar: "bg-insights-grow", tint: "bg-insights-grow/10", description: "Your longer-term plans", invitation: "Explore a plan with a duration that suits your needs.", action: "Explore growth plans", view: "lock" },
  { key: "pay", label: "Pay", icon: ReceiptText, color: "text-insights-pay", bar: "bg-insights-pay", tint: "bg-insights-pay/10", description: "Everyday money habits", invitation: "Airtime, data or electricity is an easy first step.", action: "Explore bills", view: "bills" },
] as const;
type Pillar = typeof pillars[number];
const levels = ["Starter", "Saver", "Builder", "Grower", "Wealth Maker"];
const thresholds = [0, 25, 45, 65, 85];
const readable = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const componentNames: Record<string, string> = {
  rate: "Saving a share of your inflow", consistency: "Regular savings", cushion: "Savings cushion", idle: "Putting your wallet to use",
  thrift_on_time: "On-time thrift contributions", cycle_completion: "Completed thrift cycles", split_settlement: "Settling shared bills",
  balance_ratio: "Longer-term holdings", tenor: "Time committed to growth", diversity: "Variety of growth products", rollover: "Continuing after maturity",
  bill_consistency: "Consistent bill payments", recurring_reliability: "Keeping up with recurring bills", airtime_data_share: "Airtime and data balance", category_variety: "Types of bills paid",
};
const actions: Record<string, { view: string; label: string; product?: string }> = {
  goalsave_new: { view: "lock", product: "goalsave", label: "Explore GoalSave" },
  lockmax_new: { view: "lock", product: "lockmax", label: "Explore LockMax" },
  thrift: { view: "ajo", label: "View Thrift" }, wallet_topup: { view: "fund", label: "Top up wallet" },
  savings_detail: { view: "lock", label: "View savings" }, savings: { view: "lock", label: "Explore savings" },
  bills: { view: "bills", label: "Pay a bill" }, bills_data: { view: "bills", label: "Explore data bundles" },
  wallet_split: { view: "split", label: "View Split Pay" },
};

function ScoreRing({ score, previous }: { score: number; previous: number | null }) {
  const reduced = useReducedMotion();
  const lastValue = useRef(previous ?? 0);
  const [display, setDisplay] = useState(lastValue.current);
  useEffect(() => {
    const controls = animate(lastValue.current, score, { duration: reduced ? 0 : 1.2, ease: "easeOut", onUpdate: v => setDisplay(Math.round(v)) });
    lastValue.current = score;
    return () => controls.stop();
  }, [score, reduced]);
  return <div className="relative mx-auto h-48 w-48 shrink-0" role="img" aria-label={`Money-health score ${score} out of 100`}>
    <svg viewBox="0 0 192 192" className="h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="96" cy="96" r="83" fill="none" stroke="currentColor" strokeWidth="8" className="text-ink-foreground/10" />
      <motion.circle cx="96" cy="96" r="83" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" pathLength="100" strokeDasharray="100" className="text-primary" initial={{ strokeDashoffset: 100 - (previous ?? 0) }} animate={{ strokeDashoffset: 100 - score }} transition={{ duration: reduced ? 0 : 1.2, ease: "easeOut" }} />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-5xl font-semibold tabular-nums">{display}</span><span className="mt-1 text-xs text-ink-foreground/65">out of 100</span>
    </div>
  </div>;
}

function InsightCard({ item, onUpdate, onNavigate }: { item: MoneyInsight; onUpdate: (id: string, status: "dismissed" | "acted") => Promise<boolean>; onNavigate: (view: string, product?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  const action = item.action_key ? actions[item.action_key] : undefined;
  const Icon = item.type === "win" ? Activity : item.type === "warning" ? ShieldCheck : Lightbulb;
  const perform = async (status: "dismissed" | "acted") => {
    setBusy(true); void haptic();
    const saved = await onUpdate(item.id, status);
    setBusy(false);
    if (saved && status === "acted" && action) onNavigate(action.view, action.product);
  };
  return <motion.article layout className="relative rounded-lg border border-border bg-card p-4" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.12} onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 90 && !busy) void perform("dismissed"); }}>
    <div className="flex items-start gap-3 pr-7">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-primary">{item.type === "win" ? "A win for you" : item.type === "warning" ? "Worth a look" : "One way to consider"}</p><h3 className="mt-1 text-sm font-semibold leading-snug">{item.title}</h3></div>
    </div>
    <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-11 w-11 text-muted-foreground" aria-label={`Dismiss ${item.title}`} disabled={busy} onClick={() => void perform("dismissed")}><X className="h-4 w-4" /></Button>
    <p className="mt-3 break-words text-sm leading-relaxed text-muted-foreground">{item.body}</p>
    {action && <Button variant="ghost" className="mt-2 min-h-11 max-w-full justify-start px-0 text-primary hover:bg-transparent" disabled={busy} onClick={() => void perform("acted")}><span className="whitespace-normal text-left">{action.label}</span><ArrowUpRight className="ml-2 h-4 w-4 shrink-0" /></Button>}
    <div className="border-t border-border pt-1"><Button variant="ghost" className="min-h-11 h-auto max-w-full justify-start px-0 text-xs font-normal text-muted-foreground" aria-expanded={why} onClick={() => setWhy(!why)}>Why am I seeing this?<ChevronRight className={cn("ml-1 h-3 w-3", why && "rotate-90")} /></Button>
      {why && <dl className="space-y-2 pb-2 text-xs"><div><dt className="text-muted-foreground">Signal</dt><dd className="mt-1 font-medium">{readable(item.rule_id)}</dd></div>{Object.entries(item.payload).map(([key, value]) => <div key={key} className="grid grid-cols-2 gap-3"><dt className="break-words text-muted-foreground">{readable(key)}</dt><dd className="break-words text-right">{typeof value === "number" ? value.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}<p className="text-muted-foreground">Amounts are in naira. Estimates use the displayed formula, not a guaranteed return.</p></dl>}
    </div>
  </motion.article>;
}

export function VestaraInsights({ name, onNavigate }: { name: string; onNavigate: (view: string, product?: string) => void }) {
  const { score, history, insights, streak, enabled, loading, error, refresh, updateInsight } = useVestaraInsights();
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<Pillar | null>(null);
  const [spendingOpen, setSpendingOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();
  const monthParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit" }).formatToParts(now);
  const month = `${monthParts.find(p => p.type === "year")?.value}-${monthParts.find(p => p.type === "month")?.value}`;
  const priorMonth = history.filter(h => h.month.slice(0, 7) < month).at(-1);
  const delta = score && priorMonth ? score.score - priorMonth.score : null;
  const noData = Array.isArray(score?.details?.no_data_pillars) ? score.details.no_data_pillars as string[] : [];
  const inputs = object(score?.details?.inputs);
  const details = selected ? object(object(score?.details?.pillars)[selected.key]) : {};
  const components = Object.entries(object(details.components)).map(([key, value]) => ({ key, value: typeof value === "number" ? value : null }));
  const helping = components.filter(c => c.value !== null && c.value > 0);
  const improving = components.filter(c => c.value !== null && c.value < 100);
  const newUser = !score || score.details.state === "new" || noData.length === 4;
  const next = score && score.level < 5 ? Math.max(0, thresholds[score.level] - score.score) : 0;
  const firstName = (() => {
    let raw = name?.trim();
    if (!raw || raw === "—") return "";
    // VFD bakes a corporate prefix into the registered name (e.g. "VES-DANIEL ...");
    // greet the human, not the org.
    if (raw.includes("-")) raw = raw.slice(raw.lastIndexOf("-") + 1).trim();
    const first = raw.split(/\s+/)[0];
    if (!first) return "";
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  })();
  if (loading) return <div aria-label="Loading your Money Pulse" className="space-y-5"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-80 w-full rounded-lg" /><div className="grid grid-cols-2 gap-3">{pillars.map(p => <Skeleton key={p.key} className="h-36 rounded-lg" />)}</div><Skeleton className="h-40 w-full" /></div>;
  return <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="premium-insights at-insights space-y-6 pb-6">
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{firstName ? `Hi ${firstName}` : "Your money health"}</p><h1 className="mt-1 break-words text-2xl font-semibold">Money Pulse</h1><p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric", timeZone: "Africa/Lagos" }).format(new Date(Date.now() - 29 * 86400000))} – {new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric", timeZone: "Africa/Lagos" }).format(now)} · Last 30 days</p></div>
      <div className="flex shrink-0 items-center gap-1"><span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-2 text-xs font-medium text-primary"><Flame className="h-3.5 w-3.5" />{streak.current_weeks} wk</span><Button variant="ghost" size="icon" aria-label="Refresh Money Pulse" className="h-11 w-11" disabled={refreshing} onClick={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }}><RefreshCw className="h-4 w-4" /></Button></div>
    </header>
    {error && <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-xs text-muted-foreground"><span>{error}</span><Button variant="ghost" className="min-h-11 shrink-0 text-primary" onClick={() => void refresh()}>Retry</Button></div>}
    {!enabled ? <section className="py-12 text-center"><Activity className="mx-auto h-10 w-10 text-primary" /><h2 className="mt-4 text-lg font-semibold">Money Pulse is paused</h2><p className="mt-2 text-sm text-muted-foreground">Your preference is saved. You can manage it in Profile.</p><Button className="mt-5" onClick={() => onNavigate("profile")}>Open Profile</Button></section> : <>
      <section className="rounded-lg bg-ink px-5 py-6 text-center text-ink-foreground" aria-label="Money-health score">
        <p className="text-xs font-medium text-ink-foreground/65">MONEY HEALTH</p>
        {score ? <><ScoreRing score={score.score} previous={score.previous_score} /><h2 className="mt-2 text-xl font-semibold">{levels[Math.max(0, Math.min(4, score.level - 1))]}</h2><p className="mt-1 text-sm text-ink-foreground/70">{score.level < 5 ? `${next} points to ${levels[score.level]}` : "Your strongest level yet"}</p><div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-ink-foreground/15 pt-4 text-xs text-ink-foreground/70"><span>{delta === null ? "Monthly trend builds over time" : `${delta > 0 ? "+" : ""}${delta} points vs last month`}</span><span>{score.xp.toLocaleString()} XP</span></div></> : <div className="py-10"><Activity className="mx-auto h-10 w-10 text-primary" /><p className="mt-4 text-lg font-semibold">Your pulse starts here</p><p className="mt-2 text-sm text-ink-foreground/70">Your score will appear after your first refresh.</p></div>}
      </section>
      {newUser && <section className="border-b border-border pb-5"><h2 className="text-base font-semibold">Start building your Money Pulse</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Small steps count. Explore a savings plan that fits your goals, at your own pace.</p><Button className="mt-4 min-h-11" onClick={() => onNavigate("lock")}>Explore savings<ArrowRight className="ml-2 h-4 w-4" /></Button></section>}
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Your four pillars</h2><span className="text-xs text-muted-foreground">A balanced picture</span></div><div className="grid grid-cols-2 gap-3">{pillars.map(p => { const value = score ? score[`${p.key}_score`] : null; return <Button key={p.key} variant="ghost" className="h-auto min-w-0 flex-col items-stretch rounded-lg border border-border bg-card p-4 text-left hover:bg-muted/40" onClick={() => { void haptic(); setSelected(p); }} aria-label={`${p.label} pillar, ${value ?? "not yet calculated"}${value !== null ? " out of 100" : ""}`}><div className="flex w-full items-center justify-between"><span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", p.tint, p.color)}><p.icon className="h-4 w-4" /></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></div><div className="mt-3 flex w-full items-baseline justify-between gap-2"><span className="text-sm font-semibold">{p.label}</span><span className={cn("text-2xl font-semibold tabular-nums", p.color)}>{value ?? "—"}</span></div><span className="mt-1 whitespace-normal text-[11px] font-normal text-muted-foreground">{noData.includes(p.key) ? "Ready for your first step" : p.description}</span><svg viewBox="0 0 100 4" preserveAspectRatio="none" className={cn("mt-3 h-1 w-full rounded-full", p.color)} aria-hidden="true"><rect width="100" height="4" rx="2" className="fill-muted" /><rect width={value ?? 0} height="4" rx="2" fill="currentColor" /></svg></Button>; })}</div></section>
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Insights for you</h2><ChartNoAxesCombined className="h-4 w-4 text-primary" /></div>{insights.length ? <div className="space-y-3">{[...insights].sort((a, b) => ({ win: 0, warning: 1, tip: 2 })[a.type] - ({ win: 0, warning: 1, tip: 2 })[b.type]).map(item => <InsightCard key={item.id} item={item} onUpdate={updateInsight} onNavigate={onNavigate} />)}</div> : <div className="border-y border-border py-6"><p className="text-sm font-medium">Room for your next chapter</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">As you save, contribute and pay, your activity will shape the insights here.</p></div>}</section>
      <section className="border-t border-border pt-4"><Button variant="ghost" className="h-auto min-h-14 w-full justify-between px-0 text-left" onClick={() => setSpendingOpen(true)}><span className="flex min-w-0 items-center gap-3"><ReceiptText className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0"><span className="block text-sm font-semibold">Your spending breakdown</span><span className="mt-1 block whitespace-normal text-xs font-normal text-muted-foreground">Payments, patterns and your disposable limit</span></span></span><ChevronRight className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" /></Button></section>
      <p className="flex items-start justify-center gap-1.5 text-center text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />Private to you. Educational insights, not investment advice.</p>
    </>}
    <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-t-lg pb-10"><SheetHeader><SheetTitle className={selected?.color}>{selected?.label} · {selected && score ? score[`${selected.key}_score`] : "—"}/100</SheetTitle><SheetDescription>{selected?.description} · Based on your own activity</SheetDescription></SheetHeader>
      {selected && <div className="mt-6 space-y-6"><section><h3 className="text-sm font-semibold">Six-month trend</h3>{history.length ? <><svg viewBox="0 0 300 110" role="img" aria-label={`${selected.label} monthly score trend`} className={cn("mt-3 h-28 w-full", selected.color)}><line x1="10" y1="100" x2="290" y2="100" stroke="currentColor" opacity="0.15" />{history.length > 1 && <polyline fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" points={history.map((h, i) => `${10 + i * 280 / (history.length - 1)},${100 - h[`${selected.key}_score`] * .9}`).join(" ")} />}{history.map((h, i) => <circle key={h.month} cx={history.length > 1 ? 10 + i * 280 / (history.length - 1) : 150} cy={100 - h[`${selected.key}_score`] * .9} r="4" fill="currentColor"><title>{h.month}: {h[`${selected.key}_score`]} points</title></circle>)}</svg><div className="mt-2 flex justify-between gap-2 text-[10px] text-muted-foreground">{history.map(h => <span key={h.month}>{new Intl.DateTimeFormat("en-NG", { month: "short", timeZone: "Africa/Lagos" }).format(new Date(`${h.month}T12:00:00Z`))}<span className="mt-1 block font-semibold text-foreground">{h[`${selected.key}_score`]}</span></span>)}</div>{history.length < 6 && <p className="mt-3 text-xs text-muted-foreground">{history.length} of 6 months recorded. Your trend grows as new months are added.</p>}</> : <p className="mt-3 text-sm text-muted-foreground">Your monthly trend starts with your first recorded month.</p>}</section>
      {noData.includes(selected.key) ? <section><h3 className="text-sm font-semibold">A fresh start, not a zero</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">This pillar starts at a neutral score until there is activity. {selected.invitation}</p></section> : <><section><h3 className="text-sm font-semibold">What's helping</h3>{helping.length ? <ul className="mt-3 space-y-2">{helping.map(c => <li key={c.key} className="flex items-start gap-2 text-sm"><ShieldCheck className={cn("mt-0.5 h-4 w-4 shrink-0", selected.color)} />{componentNames[c.key] ?? readable(c.key)}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Your next qualifying action can start building this pillar.</p>}</section><section><h3 className="text-sm font-semibold">Ways to build on it</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{selected.invitation}</p>{improving.length > 0 && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Room to improve: {improving.map(c => componentNames[c.key] ?? readable(c.key)).join(", ")}.</p>}</section></>}
      {selected.key === "save" && Number(inputs.external_inflow_30d) > 0 && <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">Savings rate: ₦{Number(inputs.savings_deposits_30d ?? 0).toLocaleString()} ÷ ₦{Number(inputs.external_inflow_30d).toLocaleString()} × 100 = {(Number(inputs.savings_deposits_30d ?? 0) / Number(inputs.external_inflow_30d) * 100).toFixed(1)}%.</p>}
      {selected.key === "grow" && <p className="text-xs leading-relaxed text-muted-foreground">Rollover activity is a labelled 14-day approximation, not a confirmed renewal.</p>}{selected.key === "pay" && <p className="text-xs text-muted-foreground">Betting activity is excluded from this score.</p>}
      <Button className="min-h-11 w-full" onClick={() => { const target = selected.view; setSelected(null); onNavigate(target); }}>{selected.action}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>}
    </SheetContent></Sheet>
    {spendingOpen && <SpendLockInsightsDetail open onOpenChange={setSpendingOpen} />}
  </motion.div>;
}