import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { Copy, Check, RefreshCw, Building2, ShieldCheck, AlertTriangle } from "lucide-react";

// VFD-aligned CBN bank codes (from VFD DDM docs §"Bank codes").
const VFD_BANKS: { code: string; name: string }[] = [
  { code: "000014", name: "ACCESS BANK" }, { code: "000005", name: "ACCESS BANK (DIAMOND)" },
  { code: "000036", name: "Optimus Bank" }, { code: "000010", name: "ECOBANK" },
  { code: "000007", name: "FIDELITY BANK" }, { code: "000016", name: "FIRST BANK OF NIGERIA" },
  { code: "000003", name: "FIRST CITY MONUMENT BANK (FCMB)" }, { code: "000027", name: "GLOBUS BANK" },
  { code: "000013", name: "GUARANTY TRUST BANK (GTB)" }, { code: "000020", name: "HERITAGE BANK" },
  { code: "000006", name: "JAIZ BANK" }, { code: "000002", name: "KEYStONE BANK" },
  { code: "000029", name: "LOTUS BANK" }, { code: "000008", name: "POLARIS BANK" },
  { code: "000031", name: "PremiumTrust Bank" }, { code: "000023", name: "Providus Bank" },
  { code: "000024", name: "Rand Merchant Bank" }, { code: "000012", name: "Stanbic IBTC" },
  { code: "000021", name: "STANDARD CHARTERED BANK" }, { code: "000001", name: "STERLING BANK" },
  { code: "000022", name: "SUNTRUST BANK" }, { code: "000026", name: "TAJBank" },
  { code: "000037", name: "The Alternative Bank" }, { code: "000025", name: "TITAN TRUST BANK" },
  { code: "000004", name: "UBA" }, { code: "000018", name: "UNION BANK" },
  { code: "000011", name: "UNITY BANK" }, { code: "000017", name: "Wema Bank" },
  { code: "000015", name: "ZENITH BANK" },
];

// Subject is a generic descriptor for whatever is being authorized: a thrift
// group, a Target Ajo, or a Goal Savings plan. Same VFD E-Mandate flow,
// different backing tables.
export interface MandateSubject {
  kind: "group" | "target" | "goalsave";
  id: string;
  name: string;
  contribution_amount: number;
  period: string;        // "daily" | "weekly" | "monthly"
  total_cycles: number;
}

interface Props {
  subject: MandateSubject | null;
  onClose: () => void;
  onAuthorized?: () => void;
}

type Step = "form" | "nibss" | "active";

const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

function periodLabel(p: string) {
  if (p === "daily") return "Daily";
  if (p === "weekly") return "Weekly";
  return "Monthly";
}

function computeEndDateDisplay(period: string, cycles: number): string {
  const d = new Date();
  const c = Math.max(1, cycles || 1);
  const p = (period || "").toLowerCase();
  if (p === "daily") d.setDate(d.getDate() + c);
  else if (p === "weekly") d.setDate(d.getDate() + c * 7);
  else d.setMonth(d.getMonth() + c);
  return d.toLocaleDateString("en-NG", { day: "2-digit", month: "long", year: "numeric" });
}

function kindLabel(k: MandateSubject["kind"]) {
  return k === "group" ? "thrift group" : k === "target" ? "Target Ajo" : "Goal Savings";
}

export function MandateAuthorizationDialog({ subject, onClose, onAuthorized }: Props) {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const { client } = useSandboxAwareAuth();

  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ bankCode: "", accountNumber: "", phone: "", email: "", address: "" });
  const [mandate, setMandate] = useState<{
    reference: string; code: string; nibssAccount: string; nibssMessage: string;
    payerAccount: string; bankCode: string;
  } | null>(null);
  const pollTimer = useRef<number | null>(null);
  // UX state for the NIBSS authorization step
  const [paymentReported, setPaymentReported] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Dispatch the right hook method based on subject kind.
  const accept = async (payer: { payer_bank_code: string; payer_account_number: string; payer_phone: string; payer_email: string; payer_address: string }) => {
    if (!subject) return null;
    if (subject.kind === "group") return products.acceptGroupMandate(subject.id, payer);
    if (subject.kind === "target") return products.acceptTargetMandate(subject.id, payer);
    return products.acceptGoalsaveMandate(subject.id, payer);
  };
  const checkStatus = async () => {
    if (!subject) return null;
    if (subject.kind === "group") return products.checkGroupMandateStatus(subject.id);
    if (subject.kind === "target") return products.checkTargetMandateStatus(subject.id);
    return products.checkGoalsaveMandateStatus(subject.id);
  };

  useEffect(() => {
    if (!subject) {
      setStep("form"); setMandate(null);
      setPaymentReported(false); setLastChecked(null); setCooldown(0);
      if (pollTimer.current) { window.clearInterval(pollTimer.current); pollTimer.current = null; }
      return;
    }
    (async () => {
      try {
        const { data } = await client.auth.getUser();
        const email = data?.user?.email || "";
        const phone = (data?.user?.user_metadata as Record<string, unknown>)?.phone as string || (data?.user?.phone as string) || "";
        setForm((f) => ({ ...f, email: f.email || email, phone: f.phone || phone }));
      } catch { /* non-fatal */ }
    })();
  }, [subject, client]);

  useEffect(() => {
    if (step !== "nibss" || !subject) return;
    pollTimer.current = window.setInterval(async () => {
      const res = await checkStatus();
      if (res?.data?.bank_approved) {
        if (pollTimer.current) window.clearInterval(pollTimer.current);
        setStep("active");
        toast({ title: "Mandate Approved", description: "Your bank has approved the E-Mandate." });
        onAuthorized?.();
      }
    }, 60_000);
    return () => { if (pollTimer.current) window.clearInterval(pollTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, subject?.id]);

  const selectedBank = useMemo(() => VFD_BANKS.find((b) => b.code === form.bankCode), [form.bankCode]);
  const mandateAmount = subject ? Math.max(1000, Number(subject.contribution_amount) || 0) : 0;
  const aboveMin = subject ? Number(subject.contribution_amount) >= 1000 : true;

  const submit = async () => {
    if (!subject) return;
    if (!form.bankCode || !/^\d{10}$/.test(form.accountNumber) || !form.phone || !form.email || !form.address) {
      toast({ title: "Missing info", description: "Bank, 10-digit account, phone, email and address are required.", variant: "destructive" });
      return;
    }
    if (!aboveMin) {
      toast({ title: "Below minimum", description: "VFD requires a minimum mandate amount of ₦1,000.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await accept({
        payer_bank_code: form.bankCode, payer_account_number: form.accountNumber,
        payer_phone: form.phone, payer_email: form.email, payer_address: form.address,
      });
      const payload = res?.data?.success ? res.data : (res?.success ? res : null);
      if (!payload) return;
      setMandate({
        reference: payload.mandate_reference, code: payload.mandate_code,
        nibssAccount: payload.nibss_account || "", nibssMessage: payload.nibss_message || "",
        payerAccount: payload.payer_account_number, bankCode: payload.payer_bank_code,
      });
      setStep("nibss");
    } catch {
      toast({
        title: "Mandate setup unavailable",
        description: "We couldn't connect to the mandate provider. Your setup fee will not be retained.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const copy = (val: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val).then(
      () => toast({ title: "Copied", description: val }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };

  const recheckNow = async () => {
    if (!subject) return;
    setBusy(true);
    const res = await checkStatus();
    setBusy(false);
    if (res?.data?.bank_approved) {
      setStep("active");
      toast({ title: "Mandate Approved", description: "Bank has approved your E-Mandate." });
      onAuthorized?.();
    } else {
      toast({ title: "Still pending", description: "Your bank has not approved the mandate yet. We'll keep checking in the background." });
    }
  };

  return (
    <Dialog open={!!subject} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {step === "form" && subject && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">Set Up E-Mandate</DialogTitle>
              <DialogDescription className="text-xs">
                Authorize VFD to debit your bank account for each contribution to {subject.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-muted/40 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">{kindLabel(subject.kind)}</span><span className="font-medium">{subject.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Per-cycle amount</span><span className="font-medium">₦{fmt(mandateAmount)} / {periodLabel(subject.period).toLowerCase()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Frequency</span><span className="font-medium">{periodLabel(subject.period)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cycles</span><span className="font-medium">{subject.total_cycles}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span className="font-medium">Today</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">End (approx)</span><span className="font-medium">{computeEndDateDisplay(subject.period, subject.total_cycles)}</span></div>
              </div>

              {!aboveMin && (
                <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                  <span>VFD requires a minimum mandate amount of ₦1,000.</span>
                </div>
              )}

              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Bank</Label>
                  <Select value={form.bankCode} onValueChange={(v) => setForm((f) => ({ ...f, bankCode: v }))}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Select your bank" /></SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {VFD_BANKS.map((b) => (
                        <SelectItem key={b.code} value={b.code} className="text-xs">{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Account number</Label>
                  <Input inputMode="numeric" maxLength={10}
                    value={form.accountNumber}
                    onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    placeholder="10-digit NUBAN" className="h-10" />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Use an external commercial bank account in your own name. Your Vestara (VFD) NUBAN cannot be used as the mandate payer.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="08012345678" className="h-10" />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@email.com" className="h-10" />
                </div>
                <div>
                  <Label className="text-xs">Address</Label>
                  <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Your residential address" className="h-10" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                <p className="font-semibold text-amber-700 dark:text-amber-400">₦50 NIBSS authorization charge</p>
                <p className="text-muted-foreground">After setup we'll show an account to send ₦50 to. The transfer must come from the exact account above within 7 days, or the mandate expires.</p>
              </div>
              <p className="text-[10px] text-muted-foreground">A one-time ₦100 mandate setup fee will be debited from your Vestara wallet now (₦50 internal management + ₦50 NIBSS).</p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" disabled={busy} onClick={onClose} className="h-11">Cancel</Button>
              <Button disabled={busy} onClick={submit} className="h-11">
                {busy ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                Authorize Mandate
              </Button>
            </div>
          </>
        )}

        {step === "nibss" && mandate && subject && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Check className="h-4 w-4 text-success" /> Mandate Created — Authorization Required
              </DialogTitle>
              <DialogDescription className="text-xs">
                To activate your E-Mandate, send ₦50 from your bank account ending in <span className="font-mono">{mandate.payerAccount.slice(-4)}</span> to the NIBSS account below.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold">{mandate.nibssAccount || "—"}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(mandate.nibssAccount)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground">Amount</span><span className="font-mono font-bold">₦50.00</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground">From</span><span className="font-mono">{selectedBank?.name || mandate.bankCode} • {mandate.payerAccount}</span></div>
              </div>

              {mandate.nibssMessage && (
                <div className="p-3 rounded-lg bg-muted/40 text-[11px] leading-relaxed flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 mt-0.5 flex-none text-muted-foreground" />
                  <span className="whitespace-pre-wrap">{mandate.nibssMessage}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                <p className="font-semibold text-amber-700 dark:text-amber-400">⚠ Important</p>
                <ul className="text-muted-foreground space-y-0.5 list-disc pl-4">
                  <li>The ₦50 MUST come from {mandate.payerAccount}</li>
                  <li>Complete within 7 days or the mandate expires</li>
                  <li>This is your authorization consent, not a contribution</li>
                </ul>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Reference</span><span className="font-mono">{mandate.reference}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" disabled={busy} onClick={() => copy(mandate.nibssAccount)} className="h-11">
                <Copy className="h-4 w-4 mr-1" /> Copy Account
              </Button>
              <Button disabled={busy} onClick={recheckNow} className="h-11">
                {busy ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                I've Made the Payment
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              We'll automatically recheck every 60 seconds and notify you when the bank approves.
            </p>
          </>
        )}

        {step === "active" && subject && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Check className="h-4 w-4 text-success" /> E-Mandate Active
              </DialogTitle>
              <DialogDescription className="text-xs">
                Your mandate for {subject.name} is bank-authorized and ready to debit on each cycle.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <Badge variant="success" className="text-sm">🔵 E-Mandate Active</Badge>
            </div>
            <Button onClick={onClose} className="h-11 w-full">Done</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
