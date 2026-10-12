import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ChevronDown, Clock, Delete, Lock, Share2, X, Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TransactionPinGate } from "@/components/security/TransactionPinGate";
import { useVfdBanking } from "@/hooks/useVfdBanking";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { haptic } from "@/lib/haptics";
import { getUserFriendlyError } from "@/lib/errorMessages";
import { cn } from "@/lib/utils";
import { openComplaints } from "./complaints/ComplaintsCenter";

interface WithdrawalBank {
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  set_at: string;
}

interface SandboxWithdrawProps {
  userId: string;
  accountNumber: string;
  availableBalance: number;
  /** Source of funds label (Wallet, Vault, GoalSave). */
  sourceLabel?: string;
  onWithdraw: (params: {
    fromAccount: string; toAccount: string; bankCode: string;
    amount: number; narration: string; beneficiaryName: string;
  }) => Promise<unknown>;
  onBack: () => void;
  onSetupBank: () => void;
}

type Quote = {
  transfer_fee: number; stamp_duty: number; total_fees: number;
  total_debit: number; free_quota: number; free_remaining: number; tier_label?: string;
};

type Result =
  | { kind: "success"; amount: number; reference?: string; bankRef?: string | null; session?: string | null; at: string }
  | { kind: "pending"; amount: number; reference?: string; at: string }
  | { kind: "failed"; amount: number; reason: string; reference?: string; at: string };

const MIN_AMOUNT = 1000;
const QUICK = [1000, 5000, 10000, 20000];
const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const mask = (a: string) => (a.length >= 4 ? `••••${a.slice(-4)}` : a);

/* ── Shimmer placeholder (never "...") ── */
const Shimmer = ({ className }: { className?: string }) => (
  <span className={cn("inline-block h-3 rounded-md bg-muted animate-pulse align-middle", className)} />
);

/* ── Amount with digits that roll in ── */
function RollingAmount({ value, invalid }: { value: string; invalid: boolean }) {
  const display = value === "" ? "0" : value;
  const [intPart, decPart] = display.split(".");
  const grouped = Number(intPart || "0").toLocaleString("en-NG");
  const chars = (grouped + (display.includes(".") ? "." + (decPart ?? "") : "")).split("");
  return (
    <div
      className={cn(
        "flex items-baseline justify-center font-semibold tabular-nums tracking-tight transition-colors",
        invalid ? "text-destructive" : value === "" ? "text-muted-foreground/50" : "text-foreground"
      )}
      style={{ fontSize: 56, lineHeight: 1.05 }}
      aria-live="polite"
    >
      <span className="mr-1 text-[0.6em] font-medium opacity-70">₦</span>
      <AnimatePresence initial={false} mode="popLayout">
        {chars.map((c, i) => (
          <motion.span
            key={`${i}-${c}`}
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
          >
            {c}
          </motion.span>
        ))}
      </AnimatePresence>
      <motion.span
        className="ml-0.5 inline-block w-[3px] self-center rounded-full bg-primary"
        style={{ height: "0.8em" }}
        animate={{ opacity: [1, 0.15, 1] }}
        transition={{ duration: 1.1, repeat: Infinity }}
      />
    </div>
  );
}

/* ── Self-drawing checkmark ── */
function DrawnCheck() {
  return (
    <motion.svg viewBox="0 0 52 52" className="h-20 w-20" initial="hidden" animate="show">
      <motion.circle
        cx="26" cy="26" r="24" fill="none" strokeWidth="3"
        className="stroke-success"
        variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { duration: 0.45 } } }}
      />
      <motion.path
        d="M15 27 l7 7 l15 -16" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
        className="stroke-success"
        variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { delay: 0.35, duration: 0.35 } } }}
      />
    </motion.svg>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex flex-col bg-background" style={{ minHeight: "100dvh" }}>
    {children}
  </div>
);

export function SandboxWithdraw({
  userId, accountNumber, availableBalance, sourceLabel = "Wallet", onWithdraw, onBack, onSetupBank,
}: SandboxWithdrawProps) {
  const { quoteTransfer } = useVfdBanking();
  const [bank, setBank] = useState<WithdrawalBank | null>(null);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!userId) return;
    void sandboxSupabase.from("vfd_sandbox_clients").select("metadata").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        const wb = (data?.metadata as Record<string, unknown> | null)?.withdrawal_bank as WithdrawalBank | undefined;
        if (wb?.account_number && wb?.bank_name) setBank(wb);
        setBankLoaded(true);
      });
  }, [userId]);

  const numericAmount = parseFloat(amount) || 0;

  useEffect(() => {
    if (!bank || numericAmount < MIN_AMOUNT) { setQuote(null); setQuoteLoading(false); return; }
    let cancelled = false;
    setQuoteLoading(true);
    const t = setTimeout(async () => {
      const r = await quoteTransfer({ toAccount: bank.account_number, bankCode: bank.bank_code, amount: numericAmount });
      if (cancelled) return;
      setQuoteLoading(false);
      if (r?.data) setQuote(r.data as Quote);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank?.bank_code, bank?.account_number, numericAmount]);

  const totalDebit = quote ? quote.total_debit : numericAmount;
  const exceeds = numericAmount > availableBalance || (!!quote && totalDebit > availableBalance);
  const belowMin = numericAmount > 0 && numericAmount < MIN_AMOUNT;
  const canContinue = !!bank && numericAmount >= MIN_AMOUNT && !!quote && !quoteLoading && !exceeds;

  const quickChips = useMemo(() => QUICK.filter((v) => v <= availableBalance), [availableBalance]);

  const press = (k: string) => {
    void haptic("light");
    setAmount((prev) => {
      if (k === "back") return prev.slice(0, -1);
      if (k === ".") return prev.includes(".") ? prev : (prev || "0") + ".";
      if (prev.includes(".") && prev.split(".")[1].length >= 2) return prev;
      if (prev === "0") return k;
      if (prev.replace(".", "").length >= 9) return prev;
      return prev + k;
    });
  };

  const setMax = () => {
    void haptic("light");
    // Leave room for fees so amount + fee stays within available.
    const fees = quote?.total_fees ?? 70;
    const max = Math.floor(Math.max(0, availableBalance - fees));
    setAmount(max > 0 ? String(max) : "");
  };

  const execute = async () => {
    if (!bank) return;
    setSubmitting(true);
    const at = new Date().toLocaleString("en-NG");
    try {
      const r = (await onWithdraw({
        fromAccount: accountNumber, toAccount: bank.account_number, bankCode: bank.bank_code,
        amount: numericAmount, narration: "Vestara Withdrawal", beneficiaryName: bank.account_name,
      })) as {
        reference?: string; transactionId?: string; vfd_reference?: string; session_id?: string; error?: string;
        data?: { status?: string; txnId?: string; reference?: string; sessionId?: string; message?: string };
      } | null;
      const ref = r?.reference || r?.data?.reference || r?.data?.txnId || r?.transactionId;
      const status = r?.data?.status;
      if (status === "00") {
        void haptic("success");
        setResult({ kind: "success", amount: numericAmount, reference: ref, bankRef: r?.vfd_reference || r?.data?.reference || null, session: r?.session_id || r?.data?.sessionId || null, at });
      } else if (status === "09" || status === "99" || (ref && !r?.data?.message && !r?.error)) {
        setResult({ kind: "pending", amount: numericAmount, reference: ref, at });
      } else {
        void haptic("error");
        setResult({ kind: "failed", amount: numericAmount, reference: ref, at, reason: getUserFriendlyError(r?.data?.message || r?.error || "We couldn't complete this withdrawal.") });
      }
    } catch (e) {
      void haptic("error");
      setResult({ kind: "failed", amount: numericAmount, at, reason: getUserFriendlyError(e instanceof Error ? e.message : "") });
    } finally {
      setSubmitting(false);
    }
  };

  const shareReceipt = async () => {
    if (!result || !bank) return;
    const text = `Vestara withdrawal\nAmount: ${naira(result.amount)}\nTo: ${bank.account_name} · ${bank.bank_name} ${mask(bank.account_number)}\nDate: ${result.at}${result.reference ? `\nRef: ${result.reference}` : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: "Vestara receipt", text });
      else await navigator.clipboard.writeText(text);
    } catch { /* dismissed */ }
  };

  const reset = () => { setResult(null); setShowDetails(false); setAmount(""); setQuote(null); };

  /* ── No saved bank ── */
  if (bankLoaded && !bank) {
    return (
      <Shell>
        <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-2">
          <h1 className="text-lg font-semibold">Withdraw</h1>
          <button aria-label="Close" onClick={onBack} className="h-11 w-11 -mr-2 grid place-items-center rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 grid place-items-center px-6 text-center">
          <div className="space-y-4">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-muted grid place-items-center"><Building2 className="h-6 w-6 text-muted-foreground" /></div>
            <p className="font-semibold">No withdrawal bank set</p>
            <p className="text-sm text-muted-foreground">Set it up once in Profile — every withdrawal goes straight there.</p>
            <Button variant="hero" className="h-12 rounded-2xl px-6" onClick={onSetupBank}>Set up withdrawal bank</Button>
          </div>
        </div>
      </Shell>
    );
  }

  /* ── Result ── */
  if (result) {
    const tone = result.kind === "success" ? "success" : result.kind === "pending" ? "warning" : "destructive";
    return (
      <Shell>
        <header className="flex justify-end px-5 pt-[max(env(safe-area-inset-top),16px)]">
          <button aria-label="Close" onClick={onBack} className="h-11 w-11 -mr-2 grid place-items-center rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
        </header>
        <div className={cn("flex-1 flex flex-col items-center px-6 pt-8 text-center",
          tone === "destructive" && "bg-destructive/5", tone === "warning" && "bg-warning/5")}>
          {result.kind === "success" && <DrawnCheck />}
          {result.kind === "pending" && (
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="h-20 w-20 rounded-full bg-warning/15 grid place-items-center">
              <Clock className="h-9 w-9 text-warning" />
            </motion.div>
          )}
          {result.kind === "failed" && (
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="h-20 w-20 rounded-full bg-destructive/10 grid place-items-center">
              <AlertCircle className="h-9 w-9 text-destructive" />
            </motion.div>
          )}
          <p className="mt-6 text-sm text-muted-foreground">
            {result.kind === "success" ? "Withdrawal successful" : result.kind === "pending" ? "Your withdrawal is on its way" : "Withdrawal didn't go through"}
          </p>
          <p className="mt-1 text-4xl font-semibold tabular-nums">{naira(result.amount)}</p>
          {bank && <p className="mt-2 text-sm text-muted-foreground">to {bank.account_name} · {bank.bank_name} {mask(bank.account_number)}</p>}
          {result.kind === "pending" && <p className="mt-4 max-w-xs text-sm text-muted-foreground">Your bank is still confirming it. This screen and your history will update automatically — no need to try again.</p>}
          {result.kind === "failed" && <p className="mt-4 max-w-xs text-sm text-foreground">{result.reason}</p>}

          <button onClick={() => setShowDetails((s) => !s)} className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground min-h-[44px]">
            Details <ChevronDown className={cn("h-4 w-4 transition-transform", showDetails && "rotate-180")} />
          </button>
          <AnimatePresence>
            {showDetails && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="w-full max-w-sm overflow-hidden">
                <dl className="rounded-2xl border border-border bg-card p-4 text-left text-sm space-y-2">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Date</dt><dd>{result.at}</dd></div>
                  {result.reference && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Reference</dt><dd className="font-mono text-xs break-all text-right">{result.reference}</dd></div>}
                  {result.kind === "success" && result.bankRef && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Bank reference</dt><dd className="font-mono text-xs break-all text-right">{result.bankRef}</dd></div>}
                  {result.kind === "success" && result.session && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">NIBSS session</dt><dd className="font-mono text-xs break-all text-right">{result.session}</dd></div>}
                </dl>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <footer className="grid grid-cols-2 gap-3 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] border-t border-border bg-background">
          {result.kind === "failed" ? (
            <>
              <Button variant="outline" className="h-12 rounded-2xl" onClick={() => openComplaints({ txId: result.reference, view: "new" })}>Report a problem</Button>
              <Button variant="hero" className="h-12 rounded-2xl" onClick={reset}>Try again</Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="h-12 rounded-2xl" onClick={shareReceipt}><Share2 className="h-4 w-4 mr-1.5" />Share receipt</Button>
              <Button variant="hero" className="h-12 rounded-2xl" onClick={onBack}>Done</Button>
            </>
          )}
        </footer>
      </Shell>
    );
  }

  /* ── Amount ── */
  return (
    <Shell>
      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-1">
        <h1 className="text-lg font-semibold">Withdraw</h1>
        <button aria-label="Close" onClick={onBack} className="h-11 w-11 -mr-2 grid place-items-center rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
      </header>
      <div className="px-5">
        <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          From: {sourceLabel} · Available <span className="ml-1 font-semibold text-foreground">{naira(availableBalance)}</span>
        </span>
      </div>

      <div className="flex-1 flex flex-col px-5 min-h-0 overflow-y-auto">
        <div className="my-auto py-2">
        <RollingAmount value={amount} invalid={exceeds} />
        <div className="mt-3 h-5 text-center text-xs">
          {exceeds ? (
            <span className="text-destructive font-medium">Exceeds available {naira(availableBalance)}{quote && numericAmount <= availableBalance ? " including fees" : ""}</span>
          ) : belowMin ? (
            <span className="text-destructive font-medium">Minimum withdrawal is {naira(MIN_AMOUNT)}</span>
          ) : numericAmount >= MIN_AMOUNT ? (
            quoteLoading || !quote ? <Shimmer className="w-56" /> : (
              <span className="text-muted-foreground">
                Fee {quote.transfer_fee === 0 ? "Free" : naira(quote.transfer_fee)} · Stamp duty {naira(quote.stamp_duty)} · Total <span className="font-semibold text-foreground">{naira(quote.total_debit)}</span>
              </span>
            )
          ) : <span className="text-muted-foreground">Minimum {naira(MIN_AMOUNT)}</span>}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {quickChips.map((v) => (
            <button key={v} onClick={() => { void haptic("light"); setAmount(String(v)); }}
              className={cn("h-9 rounded-full border px-3.5 text-xs font-medium transition-colors",
                numericAmount === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
              {naira(v)}
            </button>
          ))}
          <button onClick={setMax} className="h-9 rounded-full border border-border px-3.5 text-xs font-medium text-muted-foreground">Max</button>
        </div>

        {bank ? (
          <div className="mt-5 rounded-2xl border border-border bg-card p-3.5 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 grid place-items-center text-primary font-semibold">
              {bank.bank_name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{bank.bank_name} <span className="font-mono font-normal text-muted-foreground">{mask(bank.account_number)}</span></p>
              <p className="text-xs text-muted-foreground truncate">{bank.account_name}</p>
              <button onClick={onSetupBank} className="text-xs font-medium text-primary">Change in Profile</button>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success"><Check className="h-3 w-3" />Verified</span>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Saved destination" />
            </div>
          </div>
        ) : <div className="mt-5 h-[76px] rounded-2xl bg-muted animate-pulse" />}
      </div>

      <div className="grid grid-cols-3 justify-items-center gap-y-2 px-8 pt-2">
        {["1","2","3","4","5","6","7","8","9",".","0","back"].map((k) => (
          <motion.button key={k} whileTap={{ scale: 0.92 }} onClick={() => press(k)}
            aria-label={k === "back" ? "Delete" : k === "." ? "Decimal point" : k}
            className="h-[76px] w-[76px] rounded-full grid place-items-center text-2xl font-medium text-foreground active:bg-muted select-none">
            {k === "back" ? <Delete className="h-6 w-6" /> : k}
          </motion.button>
        ))}
      </div>

      <footer className="grid grid-cols-2 gap-3 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)]">
        <Button variant="outline" className="h-12 rounded-2xl border-secondary text-secondary" onClick={onBack}>Back</Button>
        <Button variant="hero" className="h-12 rounded-2xl" disabled={!canContinue || submitting} onClick={() => setReviewOpen(true)}>Continue</Button>
      </footer>

      {/* Review */}
      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent side="bottom" className="z-[60] rounded-t-3xl pb-[max(env(safe-area-inset-bottom),20px)]">
          <SheetHeader><SheetTitle className="text-left">Review withdrawal</SheetTitle></SheetHeader>
          {quote && bank && (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Amount</dt><dd className="font-semibold">{naira(numericAmount)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Transfer fee</dt><dd>{quote.transfer_fee === 0 ? "Free" : naira(quote.transfer_fee)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Stamp duty</dt><dd>{naira(quote.stamp_duty)}</dd></div>
              <div className="flex justify-between border-t border-border pt-3"><dt className="font-medium">Total debited</dt><dd className="font-semibold">{naira(quote.total_debit)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">To</dt><dd className="text-right">{bank.account_name}<br /><span className="text-muted-foreground">{bank.bank_name} {mask(bank.account_number)}</span></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Expected arrival</dt><dd>Usually within minutes</dd></div>
            </dl>
          )}
          <Button variant="hero" className="mt-6 h-12 w-full rounded-2xl" disabled={submitting}
            onClick={() => { setReviewOpen(false); setPinOpen(true); }}>
            Confirm withdrawal
          </Button>
        </SheetContent>
      </Sheet>

      <TransactionPinGate
        open={pinOpen}
        onOpenChange={setPinOpen}
        purpose="Withdrawal"
        description={`Withdraw ${naira(numericAmount)} to ${bank?.account_name || "your bank"}`}
        onVerified={execute}
      />

      {submitting && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <motion.div className="h-10 w-10 rounded-full border-[3px] border-primary border-t-transparent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
            <p className="text-sm text-muted-foreground">Sending your withdrawal…</p>
          </div>
        </div>
      )}
    </Shell>
  );
}
