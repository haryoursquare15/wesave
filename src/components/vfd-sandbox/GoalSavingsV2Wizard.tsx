import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, Info, Lock,
  Loader2, ShieldCheck, Target, AlertTriangle, ReceiptText, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useVestaraLedger } from "@/hooks/useVestaraLedger";
import { TransactionPinGate } from "@/components/security/TransactionPinGate";
import { MandateAuthorizationDialog, type MandateSubject } from "./MandateAuthorizationDialog";

type Frequency = "daily" | "weekly" | "monthly";
type Step = "setup" | "review" | "success";

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
}

const fmt = (n: number) => `₦${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });

const STEPS: { id: Step; label: string }[] = [
  { id: "setup", label: "Goal Setup" },
  { id: "review", label: "Review" },
  { id: "success", label: "Confirm" },
];

export function GoalSavingsV2Wizard({ onClose, onCreated, walletAvailable }: Props) {
  const { toast } = useToast();
  const { invoke } = useVestaraLedger();

  const [step, setStep] = useState<Step>("setup");
  const [submitting, setSubmitting] = useState(false);

  // Setup state
  const [goalName, setGoalName] = useState("");
  const [goalPurpose, setGoalPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [tenor, setTenor] = useState<number>(6);

  // Quote
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Mandate consent moved into review step
  const [lockAck, setLockAck] = useState(false);
  const [savingsId, setSavingsId] = useState<string | null>(null);
  const [createdMaturity, setCreatedMaturity] = useState<string | null>(null);
  const [mandateSubject, setMandateSubject] = useState<MandateSubject | null>(null);

  // PIN gate
  const [pinGate, setPinGate] = useState<null | {
    purpose: string; description: string; onAuthorized: () => Promise<void> | void;
  }>(null);

  const amtNum = parseFloat(amount);
  const setupValid =
    goalName.trim().length >= 2 &&
    Number.isFinite(amtNum) && amtNum >= 1000 &&
    Number.isFinite(tenor) && tenor >= 1 &&
    (frequency === "monthly" || tenor >= 4);

  // Live quote
  useEffect(() => {
    if (!setupValid) { setQuote(null); return; }
    const run = async () => {
      setQuoteLoading(true);
      const res = await invoke("goalsave_v2_quote", {
        amount: amtNum, frequency, tenor_count: tenor,
      });
      if (res?.success) setQuote(res as Quote);
      setQuoteLoading(false);
    };
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [amtNum, frequency, tenor, setupValid, invoke]);

  const tenorOptions = useMemo(() => {
    return frequency === "weekly"
      ? [4, 8, 12, 24, 52]
      : [1, 3, 6, 12, 24];
  }, [frequency]);

  const tenorLabel = (n: number) => `${n} ${frequency === "weekly" ? (n === 1 ? "week" : "weeks") : (n === 1 ? "month" : "months")}`;

  /* ──────────── Step handlers ──────────── */

  const goReview = () => {
    if (!setupValid || !quote) return;
    setStep("review");
  };

  const handleConfirm = () => {
    if (!quote) return;
    if (!lockAck) {
      toast({ title: "Acknowledgement required", description: "Please confirm you understand the lock-in terms.", variant: "destructive" });
      return;
    }
    if (quote.mandate_fee > walletAvailable) {
      toast({ title: "Insufficient wallet balance", description: `You need ${fmt(quote.mandate_fee)} to cover the mandate setup fee.`, variant: "destructive" });
      return;
    }
    setPinGate({
      purpose: "Create Goal Savings",
      description: `Authorize Direct Debit Mandate (${fmt(quote.mandate_fee)} setup fee)`,
      onAuthorized: async () => {
        setSubmitting(true);
        try {
          // 1) Create the savings shell. Real per-savings DDM authorization
          //    happens in the next step via MandateAuthorizationDialog, which
          //    collects payer bank details and calls VFD /emandate/create.
          const created = await invoke("goalsave_v2_create", {
            amount: amtNum, frequency, tenor_count: tenor,
            goal_name: goalName.trim(),
            goal_purpose: goalPurpose.trim() || null,
          });
          if (!created?.success) return;
          const sid = created.savings_id as string;
          setSavingsId(sid);
          setCreatedMaturity(created.maturity_date as string);

          // 2) Open the mandate dialog (real VFD E-Mandate creation).
          setMandateSubject({
            kind: "goalsave",
            id: sid,
            name: goalName.trim(),
            contribution_amount: amtNum,
            period: frequency,
            total_cycles: tenor,
          });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  /* ──────────── Render helpers ──────────── */

  const stepIdx = STEPS.findIndex(s => s.id === step);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose} disabled={submitting}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Goal Savings 2.0
          </h2>
          <p className="text-xs text-muted-foreground">Commit, auto-debit, earn at maturity</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex-1">
            <div className={`h-1.5 rounded-full transition-colors ${i <= stepIdx ? "bg-primary" : "bg-muted"}`} />
            <p className={`text-[10px] mt-1 font-medium ${i <= stepIdx ? "text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ─────────── STEP 1: SETUP ─────────── */}
        {step === "setup" && (
          <motion.div key="setup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="space-y-4">
            <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-4">
              <div>
                <Label className="text-xs">Goal name</Label>
                <Input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="e.g. New laptop" maxLength={80} />
              </div>
              <div>
                <Label className="text-xs">Purpose (optional)</Label>
                <Input value={goalPurpose} onChange={e => setGoalPurpose(e.target.value)} placeholder="What is this for?" maxLength={120} />
              </div>

              <div>
                <Label className="text-xs">Contribution frequency</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {(["weekly", "monthly"] as Frequency[]).map(f => (
                    <button
                      key={f}
                      onClick={() => {
                        setFrequency(f);
                        setTenor(f === "weekly" ? 4 : 1);
                      }}
                      className={`rounded-xl border p-3 text-sm font-medium capitalize transition-colors ${
                        frequency === f
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 border-border/50 hover:border-primary/40"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">Contribution amount (min ₦1,000)</Label>
                <Input
                  type="number" inputMode="numeric"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="1000" min={1000}
                  className="text-lg font-semibold h-12"
                />
                <div className="flex gap-2 flex-wrap mt-2">
                  {[1000, 2500, 5000, 10000, 25000].map(a => (
                    <button key={a} onClick={() => setAmount(String(a))}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border border-border/50 bg-muted/40 hover:border-primary/40">
                      ₦{a.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">
                  Tenor ({frequency === "weekly" ? "min 4 weeks" : "min 1 month"})
                </Label>
                <div className="grid grid-cols-5 gap-2 mt-1.5">
                  {tenorOptions.map(n => (
                    <button key={n} onClick={() => setTenor(n)}
                      className={`rounded-xl border py-2 text-xs font-medium transition-colors ${
                        tenor === n
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 border-border/50 hover:border-primary/40"
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Selected: {tenorLabel(tenor)}
                </p>
              </div>
            </div>

            {/* Live preview */}
            <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/10 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live projection</p>
              {quoteLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Calculating…
                </div>
              ) : quote ? (
                <div className="space-y-1.5 text-sm">
                  <Row label="Interest rate" value={`${quote.rate}% p.a.`} />
                  <Row label="Total contributions" value={fmt(quote.total_contributions)} />
                  <Row label="Projected interest" value={`+${fmt(quote.projected_interest)}`} highlight />
                  <Row label="Maturity value" value={fmt(quote.projected_maturity_value)} highlight />
                  <Row label="Matures on" value={fmtDate(quote.maturity_date)} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Enter your goal details to see a projection.</p>
              )}
            </div>

            <Button onClick={goReview} disabled={!setupValid || !quote} className="w-full h-12">
              Continue <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </motion.div>
        )}



        {/* ─────────── STEP 3: REVIEW ─────────── */}
        {step === "review" && quote && (
          <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="space-y-4">
            <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-2">
              <h3 className="text-sm font-semibold mb-2">Goal Savings Summary</h3>
              <Row label="Goal name" value={goalName} />
              {goalPurpose && <Row label="Purpose" value={goalPurpose} />}
              <Separator className="my-2" />
              <Row label="Contribution" value={fmt(quote.contribution_amount)} />
              <Row label="Frequency" value={quote.frequency} className="capitalize" />
              <Row label="Tenor" value={tenorLabel(tenor)} />
              <Row label="Interest rate" value={`${quote.rate}% p.a.`} />
              <Separator className="my-2" />
              <Row label="Total contributions" value={fmt(quote.total_contributions)} />
              <Row label="Projected interest" value={`+${fmt(quote.projected_interest)}`} highlight />
              <Row label="Maturity value" value={fmt(quote.projected_maturity_value)} highlight />
              <Row label="Maturity date" value={fmtDate(quote.maturity_date)} />
              <Separator className="my-2" />
              <Row label="Mandate setup fee" value={fmt(quote.mandate_fee)} />
              <Row label="Next debit" value={fmtDate(quote.schedule[0].scheduled_at)} />
            </div>

            <details className="bg-card rounded-2xl border border-border/50 p-4">
              <summary className="text-xs font-semibold cursor-pointer flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> View debit schedule ({quote.schedule.length} debits)
              </summary>
              <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
                {quote.schedule.map(s => (
                  <div key={s.seq} className="flex items-center justify-between text-xs border-b border-border/30 pb-1.5">
                    <span className="text-muted-foreground">#{s.seq} · {fmtDate(s.scheduled_at)}</span>
                    <span className="font-medium">{fmt(s.amount)}</span>
                  </div>
                ))}
              </div>
            </details>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Locked until maturity</AlertTitle>
              <AlertDescription className="text-xs">
                This savings plan is locked until <strong>{fmtDate(quote.maturity_date)}</strong>. Withdrawals,
                partial withdrawals, and early cancellations are not permitted before the maturity date.
              </AlertDescription>
            </Alert>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border/50 cursor-pointer">
              <Checkbox checked={lockAck} onCheckedChange={v => setLockAck(!!v)} />
              <span className="text-xs leading-relaxed">
                I understand my funds will be locked until maturity and I cannot withdraw, partially withdraw, or
                cancel this savings plan before <strong>{fmtDate(quote.maturity_date)}</strong>.
              </span>
            </label>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("setup")} className="flex-1" disabled={submitting}>
                Edit
              </Button>
              <Button onClick={handleConfirm} disabled={!lockAck || submitting} className="flex-1">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Confirm &amp; Create</>}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ─────────── STEP 4: SUCCESS ─────────── */}
        {step === "success" && quote && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="space-y-4">
            <div className="bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Goal created successfully</h3>
                <p className="text-xs text-muted-foreground mt-1">{goalName}</p>
              </div>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                <Sparkles className="h-3 w-3 mr-1" /> Mandate authorized
              </Badge>
            </div>

            <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-2">
              <Row label="Next debit date" value={fmtDate(quote.schedule[0].scheduled_at)} highlight />
              <Row label="Contribution amount" value={fmt(quote.contribution_amount)} />
              <Row label="Frequency" value={quote.frequency} className="capitalize" />
              <Row label="Maturity date" value={fmtDate(createdMaturity || quote.maturity_date)} />
              <Row label="Projected maturity value" value={fmt(quote.projected_maturity_value)} highlight />
              {savingsId && (
                <Row label="Reference" value={savingsId.slice(0, 8).toUpperCase()} />
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Return to Dashboard</Button>
              <Button onClick={onClose} className="flex-1">View Goal Savings</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN gate */}
      {pinGate && (
        <TransactionPinGate
          open={!!pinGate}
          onOpenChange={(o) => { if (!o) setPinGate(null); }}
          purpose={pinGate.purpose}
          description={pinGate.description}
          onVerified={async () => {
            const fn = pinGate.onAuthorized;
            setPinGate(null);
            await fn();
          }}
        />
      )}

      {/* Direct Debit Mandate authorization — VFD E-Mandate Create + NIBSS ₦50 leg */}
      <MandateAuthorizationDialog
        subject={mandateSubject}
        onClose={() => setMandateSubject(null)}
        onAuthorized={() => {
          setMandateSubject(null);
          setStep("success");
          onCreated();
        }}
      />
    </div>
  );
}

function Row({
  label, value, highlight, className,
}: { label: string; value: string; highlight?: boolean; className?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`${highlight ? "font-bold text-foreground" : "font-medium text-foreground"} ${className || ""}`}>
        {value}
      </span>
    </div>
  );
}
