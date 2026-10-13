import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Info, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { openComplaints } from "./complaints/ComplaintsCenter";
import { fmtDate } from "./SavingsPlanCard";
import { mandateAuthorizationDetails } from "@/lib/mandateAuthorizationDetails";

interface Row {
  id: string;
  status: string;
  amount: number | null;
  frequency: string | null;
  payer_account_number: string | null;
  nibss_account: string | null;
  nibss_message: string | null;
  bank_approved_at: string | null;
  rejection_reason: string | null;
  expires_at: string | null;
  last_polled_at: string | null;
  created_at: string;
}

type View = "waiting_transfer" | "waiting_bank" | "active" | "attention";

/** Map real backend values only. There is no separate "checking your transfer" status today. */
function viewOf(status: string): View {
  if (status === "bank_approved" || status === "authorized") return "active";
  if (status === "awaiting_approval") return "waiting_bank";
  if (status === "pending") return "waiting_transfer";
  return "attention";
}

/** NIBSS returns the token amount inside its message ("N50:00"); fall back to ₦50. */
function tokenAmount(msg: string | null) {
  const m = msg?.match(/N\s?(\d+)[.:]00/);
  return m ? Number(m[1]) : 50;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mandateId: string | null;
  planLabel: string;
  firstDebitAt: string | null;
}

export function MandateStatusSheet({ open, onOpenChange, mandateId, planLabel, firstDebitAt }: Props) {
  const { client } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [row, setRow] = useState<Row | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [why, setWhy] = useState(false);

  const load = useCallback(async () => {
    if (!mandateId) return;
    setLoading(true);
    const { data } = await client
      .from("mandates")
      .select("id, status, amount, frequency, payer_account_number, nibss_account, nibss_message, bank_approved_at, rejection_reason, expires_at, last_polled_at, created_at")
      .eq("id", mandateId)
      .maybeSingle();
    setRow((data as unknown as Row) || null);
    setCheckedAt(new Date());
    setLoading(false);
  }, [client, mandateId]);

  useEffect(() => {
    if (!open || !mandateId) return;
    void load();
    // Read-only realtime; falls back to a gentle 20s refresh.
    const ch = client
      .channel(`mandate-${mandateId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mandates", filter: `id=eq.${mandateId}` }, () => void load())
      .subscribe();
    const t = window.setInterval(() => void load(), 20000);
    return () => { window.clearInterval(t); void client.removeChannel(ch); };
  }, [open, mandateId, client, load]);

  useEffect(() => {
    if (row) setStep(viewOf(row.status) === "waiting_transfer" ? 1 : 2);
  }, [row?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const last4 = row?.payer_account_number?.slice(-4) || "••••";
  const amt = tokenAmount(row?.nibss_message || null);
  const receivingDetails = mandateAuthorizationDetails(row?.nibss_message);
  const view = row ? viewOf(row.status) : null;

  const copy = async () => {
    if (!row?.nibss_account) return;
    await navigator.clipboard.writeText(row.nibss_account);
    void haptic("light");
    toast({ title: "Account number copied" });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[100dvh] max-h-[100dvh] overflow-y-auto rounded-none p-0 bg-background">
        <div className="max-w-lg mx-auto px-5 pt-5 pb-8 space-y-5">
          <div className="space-y-2 pr-8">
            <p className="text-xs font-medium text-muted-foreground">Mandate · Step {step} of 2</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="h-1 rounded-full bg-primary" />
              <div className={cn("h-1 rounded-full", step === 2 ? "bg-primary" : "bg-muted")} />
            </div>
          </div>

          {!row ? (
            <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : step === 1 ? (
            <>
              <div>
                <SheetTitle className="text-xl font-bold">Verify your bank account</SheetTitle>
                <p className="text-sm text-muted-foreground mt-1">Send ₦{amt} from the account you want debited. This proves you own it.</p>
              </div>

              <div className="rounded-[20px] bg-gradient-ink text-ink-foreground p-5 space-y-2">
                <p className="text-xs opacity-70">Send exactly</p>
                <p className="text-4xl font-bold tabular-nums">₦{amt}</p>
                <span className="inline-block rounded-full bg-ink-foreground/10 px-3 py-1 text-[11px]">One-time bank verification</span>
              </div>

              <div className="rounded-[20px] border border-border bg-card divide-y divide-border text-sm">
                <RowItem label="From" value={`Your bank ••••${last4}`} />
                <RowItem label="Account name" value={receivingDetails.accountName} />
                <RowItem label="Receiving bank" value={receivingDetails.bank} />
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Account number</p>
                    <p className="text-lg font-bold tracking-wider tabular-nums">{row.nibss_account || "Not available yet"}</p>
                  </div>
                  {row.nibss_account && (
                    <Button variant="outline" size="icon" className="rounded-[14px]" onClick={copy} aria-label="Copy account number">
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-warning/10 px-4 py-3 flex gap-2 text-xs">
                <Info className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <p>The transfer must come from your bank account ••••{last4}. A transfer from any other account can't verify this mandate.
                  {row.expires_at && <> Complete it by {fmtDate(row.expires_at)}.</>}</p>
              </div>

              <p className="text-xs text-muted-foreground">
                Your bank confirms the transfer automatically.{" "}
                <button className="text-primary font-medium" onClick={() => setWhy(w => !w)}>Why do we ask?</button>
              </p>
              {why && (
                <p className="text-xs text-muted-foreground rounded-2xl bg-muted p-3">
                  Sending ₦{amt} from your own account proves you own it. Your bank then confirms the direct-debit mandate, and only then can your plan start saving.
                </p>
              )}

              <div className="space-y-2 pt-2">
                <Button className="w-full h-14 rounded-2xl text-base active:scale-[0.96] transition-transform" onClick={() => { void haptic("light"); setStep(2); }}>
                  I've sent the ₦{amt}
                </Button>
                <Button variant="ghost" className="w-full h-12 rounded-2xl" onClick={() => onOpenChange(false)}>I'll do it later</Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <SheetTitle className="text-xl font-bold">Mandate status</SheetTitle>
                <span className="mt-2 inline-block rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium">{planLabel}</span>
              </div>

              <StatusCard view={view!} row={row} firstDebitAt={firstDebitAt} last4={last4} />

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Last checked {checkedAt?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                <Button variant="outline" size="sm" className="rounded-[14px]" onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} /> Refresh
                </Button>
              </div>

              <Tracker view={view!} last4={last4} amt={amt} firstDebitAt={firstDebitAt} />

              <div className="space-y-2 pt-2">
                {view === "waiting_transfer" && (
                  <Button variant="outline" className="w-full h-12 rounded-2xl" onClick={() => setStep(1)}>See transfer details</Button>
                )}
                <Button variant="secondary" className="w-full h-14 rounded-2xl text-base" onClick={() => onOpenChange(false)}>Back to my savings</Button>
                <button
                  className="w-full text-center text-xs text-primary font-medium py-2"
                  onClick={() => { onOpenChange(false); openComplaints({ view: "new" }); }}
                >
                  Something wrong? Report a problem
                </button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RowItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right min-w-0 break-words">{value}</span>
    </div>
  );
}

function StatusCard({ view, row, firstDebitAt, last4 }: { view: View; row: Row; firstDebitAt: string | null; last4: string }) {
  const map = {
    waiting_transfer: { chip: "Waiting for your transfer", chipCls: "bg-warning/10 text-warning", title: "We haven't seen your transfer yet", detail: `Send the token payment from ••••${last4}.` },
    waiting_bank: { chip: "Waiting for your bank", chipCls: "bg-accent text-accent-foreground", title: "Your bank is confirming the mandate", detail: "This usually takes a few minutes. You can leave this screen." },
    active: { chip: "Mandate active", chipCls: "bg-success/10 text-success", title: "Your plan is live", detail: firstDebitAt ? `The first debit is planned for ${fmtDate(firstDebitAt)}.` : "Debits will run on your schedule." },
    attention: { chip: "Needs your attention", chipCls: "bg-destructive/10 text-destructive", title: row.status === "expired" ? "The authorization window closed" : "Your bank did not approve this mandate", detail: row.rejection_reason || "Start a new plan to try again, or report a problem." },
  }[view];
  return (
    <div className={cn("rounded-[20px] border p-4 space-y-2", view === "attention" ? "border-destructive/30 bg-destructive/5" : "border-border bg-card")}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center shrink-0">
          {view === "active" ? <Check className="h-5 w-5 text-success" />
            : view === "attention" ? <AlertCircle className="h-5 w-5 text-destructive" />
            : <Loader2 className="h-5 w-5 text-primary animate-spin" />}
        </div>
        <div className="min-w-0">
          <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium", map.chipCls)}>{map.chip}</span>
          <p className="text-sm font-semibold mt-1">{map.title}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{map.detail}</p>
    </div>
  );
}

function Tracker({ view, last4, amt, firstDebitAt }: { view: View; last4: string; amt: number; firstDebitAt: string | null }) {
  const rank = { waiting_transfer: 1, waiting_bank: 2, active: 4, attention: -1 }[view];
  const steps = [
    { t: "Plan created", d: "" },
    { t: "Bank account verified", d: rank >= 2 ? `₦${amt} received from ••••${last4}` : "" },
    { t: "Bank confirming the mandate", d: "" },
    { t: "Mandate active", d: "" },
    { t: "First debit", d: firstDebitAt ? `Planned for ${fmtDate(firstDebitAt)}` : "" },
  ];
  return (
    <ol className="rounded-[20px] border border-border bg-card p-4 space-y-3">
      {steps.map((s, i) => {
        const done = i === 0 || (rank >= 0 && i < rank) || (rank === 4 && i === 3);
        const current = rank >= 0 && i === rank && rank < 4;
        return (
          <li key={s.t} className="flex gap-3">
            <span className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold",
              done ? "bg-success text-success-foreground" : current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}>
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div>
              <p className={cn("text-sm", current ? "font-semibold" : done ? "" : "text-muted-foreground")}>{s.t}</p>
              {s.d && <p className="text-xs text-muted-foreground">{s.d}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
