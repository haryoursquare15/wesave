import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, Loader2, Target, Vault as VaultIcon, Zap, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useVestaraLedger, type VestaraProduct, type VestaraProductCode } from "@/hooks/useVestaraLedger";
import { TransactionPinGate } from "@/components/security/TransactionPinGate";
import { MandateAuthorizationDialog, type MandateSubject } from "./MandateAuthorizationDialog";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type Frequency = "daily" | "weekly" | "monthly";
type Step = 1 | 2 | 3 | 4 | "done";

interface Quote {
  rate: number;
  frequency: Frequency;
  tenor_count: number;
  tenor_days: number;
  contribution_amount: number;
  total_contributions: number;
  projected_interest: number;
  projected_maturity_value: number;
  maturity_date: string;
  start_date: string;
  mandate_fee: number;
  schedule: { seq: number; scheduled_at: string; amount: number }[];
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
  walletAvailable: number;
  products?: VestaraProduct[];
  /** Vault / LockMax are funded from the wallet and use their own flow. */
  onPickProduct?: (code: VestaraProductCode) => void;
}

const fmt = (n: number) => `₦${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Backend (goalsave_v2_quote) enforces ₦1,000 minimum; it is not stored in product config.
const MIN_AMOUNT = 1000;
const QUICK = [1000, 2500, 5000, 10000, 25000];
const DAYS_PER: Record<Frequency, number> = { daily: 1, weekly: 7, monthly: 30 };
const CANDIDATES: Record<Frequency, number[]> = {
  daily: [7, 14, 30, 60, 90],
  weekly: [4, 8, 12, 24, 52],
  monthly: [1, 3, 6, 12, 24],
};
const UNIT: Record<Frequency, [string, string]> = { daily: ["day", "days"], weekly: ["week", "weeks"], monthly: ["month", "months"] };

const ICONS: Partial<Record<VestaraProductCode, React.ComponentType<{ className?: string }>>> = {
  goalsave: Target, vault: VaultIcon, lockmax: Zap,
};

export function GoalSavingsV2Wizard({ onClose, onCreated, walletAvailable, products = [], onPickProduct }: Props) {
  const { toast } = useToast();
  const { invoke } = useVestaraLedger();
  const reduce = useReducedMotion();

  const choices = products.filter(p => p.is_active !== false && ["goalsave", "vault", "lockmax"].includes(p.code));
  const goalsave = products.find(p => p.code === "goalsave");

  const [step, setStep] = useState<Step>(choices.length > 0 ? 1 : 2);
  const [picked, setPicked] = useState<VestaraProductCode>("goalsave");
  const [goalName, setGoalName] = useState("");
  const [amount, setAmount] = useState("5000");
  const [frequency, setFrequency] = useState<Frequency>("weekly");

  // Original GoalSave 2.0 tenor options and minimums (unchanged product rules).
  const tenorOptions = useMemo(() => CANDIDATES[frequency], [frequency]);
  const [tenor, setTenor] = useState<number>(4);
  useEffect(() => {
    if (!tenorOptions.includes(tenor)) setTenor(tenorOptions[Math.min(1, tenorOptions.length - 1)]);
  }, [tenorOptions, tenor]);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [ack, setAck] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [mandateSubject, setMandateSubject] = useState<MandateSubject | null>(null);
  const [created, setCreated] = useState<MandateSubject | null>(null);

  const amtNum = Number(amount.replace(/,/g, ""));
  const setupValid = goalName.trim().length >= 2 && amtNum >= MIN_AMOUNT && tenorOptions.includes(tenor);
  const unit = (n: number) => UNIT[frequency][n === 1 ? 0 : 1];

  useEffect(() => {
    if (!(amtNum >= MIN_AMOUNT) || !tenorOptions.includes(tenor)) { setQuote(null); return; }
    const t = setTimeout(async () => {
      setQuoteLoading(true);
      const res = await invoke("goalsave_v2_quote", { amount: amtNum, frequency, tenor_count: tenor });
      if (res?.success) setQuote(res as Quote);
      setQuoteLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [amtNum, frequency, tenor, tenorOptions, invoke]);

  // GoalSave 2.0 rule: locked until maturity — no withdrawals, partial withdrawals or cancellation.
  const earlyRule = "not allowed. This plan is locked until the maturity date — no withdrawals, partial withdrawals or cancellation";

  const back = () => {
    void haptic("light");
    if (step === 1 || (step === 2 && choices.length === 0)) return onClose();
    if (typeof step === "number") setStep((step - 1) as Step);
  };

  const next = () => {
    void haptic("light");
    if (step === 1) {
      if (picked !== "goalsave") { onPickProduct?.(picked); return; }
      setStep(2);
    } else if (step === 2) setStep(3);
    else if (step === 3) setStep(4);
  };

  const confirm = () => {
    if (!quote || !ack) return;
    if (quote.mandate_fee > walletAvailable) {
      toast({ title: "Add money first", description: `You need ${fmt(quote.mandate_fee)} in your wallet for the bank authorization fee.`, variant: "destructive" });
      return;
    }
    setPinOpen(true);
  };

  const create = async () => {
    setSubmitting(true);
    try {
      const res = await invoke("goalsave_v2_create", {
        amount: amtNum, frequency, tenor_count: tenor, goal_name: goalName.trim(), goal_purpose: null,
      });
      if (!res?.success) return;
      void haptic("success");
      setCreated({
        kind: "goalsave", id: res.savings_id as string, name: goalName.trim(),
        contribution_amount: amtNum, period: frequency, total_cycles: tenor,
      });
      setStep("done");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  const anim = reduce
    ? {}
    : { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 }, transition: { duration: 0.22, ease: "easeOut" as const } };

  const primary = (label: string, onClick: () => void, disabled = false, loading = false) => (
    <Button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full h-14 rounded-2xl text-base font-semibold active:scale-[0.96] transition-transform"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : label}
    </Button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 bg-background">
        <div className="max-w-lg w-full mx-auto px-5 pt-3 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={step === "done" ? onClose : back} disabled={submitting} aria-label={step === "done" ? "Close" : "Back"}>
              {step === "done" || step === 1 ? <X className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
            </Button>
            {step !== "done" && <span className="text-xs font-medium text-muted-foreground">Step {step} of 4</span>}
          </div>
          {step !== "done" && (
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={cn("h-1 rounded-full transition-colors duration-300", i <= (step as number) ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 py-4">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="s1" {...anim} className="space-y-4">
                <h2 className="text-2xl font-bold">What are you saving for?</h2>
                <div className="space-y-3">
                  {choices.map(p => {
                    const Icon = ICONS[p.code] || Target;
                    const sel = picked === p.code;
                    return (
                      <button
                        key={p.id}
                        onClick={() => { void haptic("light"); setPicked(p.code); }}
                        className={cn(
                          "w-full text-left rounded-[20px] bg-card p-4 flex items-start gap-3 transition-all duration-200 active:scale-[0.98]",
                          sel ? "border-2 border-primary" : "border border-border",
                        )}
                      >
                        <span className="h-11 w-11 rounded-[14px] bg-accent flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5 text-primary" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold">{p.name}</span>
                          {p.description && <span className="block text-xs text-muted-foreground line-clamp-1">{p.description}</span>}
                          <span className="block text-xs text-muted-foreground mt-1">
                            Up to {p.max_user_rate}% p.a. · {p.min_tenor_days}–{p.max_tenor_days} days
                          </span>
                        </span>
                        {sel && <span className="h-6 w-6 rounded-full bg-primary flex items-center justify-center"><Check className="h-4 w-4 text-primary-foreground" /></span>}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" {...anim} className="space-y-5">
                <h2 className="text-2xl font-bold">Set it up</h2>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Goal name</label>
                  <Input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="e.g. New laptop" maxLength={80} className="h-12 rounded-2xl mt-1" />
                </div>

                <div className="text-center space-y-2">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-2xl font-bold text-muted-foreground">₦</span>
                    <input
                      inputMode="numeric"
                      aria-label="Amount each debit"
                      value={amtNum ? amtNum.toLocaleString() : ""}
                      onChange={e => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      placeholder="0"
                      className="w-full max-w-[240px] bg-transparent text-center text-4xl font-bold tabular-nums outline-none"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Minimum {fmt(MIN_AMOUNT)}</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    {QUICK.map(a => (
                      <button key={a} onClick={() => setAmount(String(a))}
                        className={cn("h-9 px-3 rounded-[14px] text-xs font-medium border transition-colors",
                          amtNum === a ? "bg-accent text-accent-foreground border-primary/40" : "bg-card border-border")}>
                        {fmt(a)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 rounded-[14px] bg-muted p-1">
                  {(["daily", "weekly", "monthly"] as Frequency[]).map(f => (
                    <button key={f} onClick={() => setFrequency(f)}
                      className={cn("h-10 rounded-[12px] text-sm font-semibold capitalize transition-all", frequency === f ? "bg-card shadow-sm" : "text-muted-foreground")}>
                      {f}
                    </button>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">How long?</p>
                  <div className="flex gap-2 flex-wrap">
                    {tenorOptions.map(n => (
                      <button key={n} onClick={() => setTenor(n)}
                        className={cn("h-10 px-4 rounded-[14px] text-sm font-medium border transition-colors",
                          tenor === n ? "bg-accent text-accent-foreground border-primary" : "bg-card border-border")}>
                        {n} {unit(n)}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && quote && (
              <motion.div key="s3" {...anim} className="space-y-4">
                <h2 className="text-2xl font-bold">Review your plan</h2>
                <div className="rounded-[20px] bg-gradient-ink text-ink-foreground p-5">
                  <p className="text-xs opacity-70">Estimated at maturity</p>
                  <p className="text-3xl font-bold tabular-nums">{fmt(quote.projected_maturity_value)}</p>
                  <p className="text-xs opacity-80 mt-1">{fmt(quote.total_contributions)} saved + about {fmt(quote.projected_interest)} interest</p>
                </div>
                <div className="rounded-[20px] border border-border bg-card divide-y divide-border">
                  <Row label="Plan" value={`${goalsave?.name || "GoalSave"} · ${goalName}`} />
                  <Row label="Each debit" value={`${fmt(quote.contribution_amount)} ${frequency} × ${quote.tenor_count}`} />
                  {quote.schedule[0] && <Row label="First debit date" value={fmtDate(quote.schedule[0].scheduled_at)} />}
                  <Row label="Matures" value={fmtDate(quote.maturity_date)} />
                  <Row label="Interest rate (estimated)" value={`${quote.rate}% p.a. on saved amount`} />
                  <Row label="Bank authorization fee" value={`${fmt(quote.mandate_fee)} from your wallet`} />
                  <Row label="Debited from" value="Bank account you link next" />
                </div>
                <div className="rounded-2xl bg-warning/10 px-4 py-3 flex gap-2 text-xs">
                  <Info className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p>Early exit: {earlyRule}. Keep {fmt(quote.contribution_amount)} available on each debit date; we'll tell you if a debit fails.</p>
                </div>
                <button className="text-sm font-medium text-primary" onClick={() => setScheduleOpen(true)}>
                  View debit schedule ({quote.schedule.length} debits)
                </button>
              </motion.div>
            )}

            {step === 4 && quote && (
              <motion.div key="s4" {...anim} className="space-y-4">
                <h2 className="text-2xl font-bold">Confirm with your PIN</h2>
                <label className="flex items-start gap-3 rounded-[20px] border border-border bg-card p-4 cursor-pointer">
                  <Checkbox checked={ack} onCheckedChange={v => setAck(!!v)} className="mt-0.5" />
                  <span className="text-sm leading-relaxed">
                    I understand {fmt(quote.total_contributions)} will be saved {frequency} from my linked bank account and
 can't be withdrawn, partially withdrawn or cancelled before {fmtDate(quote.maturity_date)}.
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">You'll enter your 4-digit transaction PIN next.</p>
              </motion.div>
            )}

            {step === "done" && created && (
              <motion.div key="done" initial={reduce ? undefined : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 pt-4">
                <div className="text-center space-y-3">
                  <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                    <Check className="h-8 w-8 text-success" />
                  </div>
                  <h2 className="text-2xl font-bold">Plan created</h2>
                  <p className="text-sm text-muted-foreground">
                    Your plan starts saving once your bank confirms the debit mandate. First, link your bank account
                    {quote ? ` (${fmt(quote.mandate_fee)} fee from your wallet)` : ""} and send a small verification transfer from it.
                  </p>
                </div>
                <ol className="rounded-[20px] border border-border bg-card p-4 space-y-3">
                  {["Plan created", "Authorize your bank account", "Bank confirms the mandate", "First debit"].map((t, i) => (
                    <li key={t} className="flex items-center gap-3">
                      <span className={cn("h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold",
                        i === 0 ? "bg-success text-success-foreground" : i === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        {i === 0 ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className={cn("text-sm", i === 1 ? "font-semibold" : i > 1 ? "text-muted-foreground" : "")}>{t}</span>
                    </li>
                  ))}
                </ol>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Pinned bottom */}
      <div className="border-t border-border bg-background">
        <div className="max-w-lg mx-auto px-5 pt-3 safe-bottom space-y-2">
          {step === 1 && primary("Continue", next)}
          {step === 2 && (
            <>
              <div className="rounded-[20px] border border-border bg-card p-4 space-y-1">
                {quoteLoading && !quote ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Calculating…</p>
                ) : quote ? (
                  <>
                    <p className="text-sm font-semibold">{fmt(quote.contribution_amount)} {frequency} × {quote.tenor_count} = {fmt(quote.total_contributions)}</p>
                    <p className="text-sm text-success">Estimated interest +{fmt(quote.projected_interest)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmt(quote.mandate_fee)} bank authorization fee from your wallet when you link your bank. Shown now, no surprises.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Minimum {fmt(MIN_AMOUNT)} per debit.</p>
                )}
              </div>
              {primary("Continue", next, !setupValid || !quote)}
            </>
          )}
          {step === 3 && primary("Continue", next, !quote)}
          {step === 4 && primary("Confirm and create", confirm, !ack, submitting)}
          {step === "done" && (
            <>
              {primary("Authorize bank account", () => setMandateSubject(created))}
              <Button variant="ghost" className="w-full h-12 rounded-2xl" onClick={onClose}>I'll do it later</Button>
            </>
          )}
        </div>
      </div>

      <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-[20px]">
          <SheetTitle className="text-base font-bold mb-3">Debit schedule</SheetTitle>
          <div className="divide-y divide-border">
            {quote?.schedule.map(s => (
              <div key={s.seq} className="flex justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">#{s.seq} · {fmtDate(s.scheduled_at)}</span>
                <span className="font-medium tabular-nums">{fmt(s.amount)}</span>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {pinOpen && (
        <TransactionPinGate
          open={pinOpen}
          onOpenChange={setPinOpen}
          purpose="Create GoalSave plan"
          description={`${fmt(amtNum)} ${frequency} × ${tenor}`}
          onVerified={async () => { setPinOpen(false); await create(); }}
        />
      )}

      <MandateAuthorizationDialog
        subject={mandateSubject}
        onClose={() => { setMandateSubject(null); onClose(); }}
        onAuthorized={() => { setMandateSubject(null); onClose(); }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}
