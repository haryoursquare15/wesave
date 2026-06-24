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

// VFD-aligned CBN bank codes. Sourced from the VFD DDM documentation §"Bank
// codes" table. Keep this list in sync with what VFD's /emandate/create
// endpoint accepts as `payerBank`.
const VFD_BANKS: { code: string; name: string }[] = [
  { code: "000014", name: "ACCESS BANK" },
  { code: "000005", name: "ACCESS BANK (DIAMOND)" },
  { code: "000036", name: "Optimus Bank" },
  { code: "000010", name: "ECOBANK" },
  { code: "000007", name: "FIDELITY BANK" },
  { code: "000016", name: "FIRST BANK OF NIGERIA" },
  { code: "000003", name: "FIRST CITY MONUMENT BANK (FCMB)" },
  { code: "000027", name: "GLOBUS BANK" },
  { code: "000013", name: "GUARANTY TRUST BANK (GTB)" },
  { code: "000020", name: "HERITAGE BANK" },
  { code: "000006", name: "JAIZ BANK" },
  { code: "000002", name: "KEYStONE BANK" },
  { code: "000029", name: "LOTUS BANK" },
  { code: "000008", name: "POLARIS BANK" },
  { code: "000031", name: "PremiumTrust Bank" },
  { code: "000023", name: "Providus Bank" },
  { code: "000024", name: "Rand Merchant Bank" },
  { code: "000012", name: "Stanbic IBTC" },
  { code: "000021", name: "STANDARD CHARTERED BANK" },
  { code: "000001", name: "STERLING BANK" },
  { code: "000022", name: "SUNTRUST BANK" },
  { code: "000026", name: "TAJBank" },
  { code: "000037", name: "The Alternative Bank" },
  { code: "000025", name: "TITAN TRUST BANK" },
  { code: "000004", name: "UBA" },
  { code: "000018", name: "UNION BANK" },
  { code: "000011", name: "UNITY BANK" },
  { code: "000017", name: "Wema Bank" },
  { code: "000015", name: "ZENITH BANK" },
  { code: "999999", name: "VFD Microfinance Bank (Sandbox)" },
];

interface Group {
  id: string;
  name: string;
  contribution_amount: number;
  period: string;
  total_cycles: number;
  max_members: number;
  mandate_reference?: string | null;
}

interface Props {
  group: Group | null;
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

export function MandateAuthorizationDialog({ group, onClose, onAuthorized }: Props) {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const { client } = useSandboxAwareAuth();

  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    bankCode: "",
    accountNumber: "",
    phone: "",
    email: "",
    address: "",
  });
  const [mandate, setMandate] = useState<{
    reference: string;
    code: string;
    nibssAccount: string;
    nibssMessage: string;
    payerAccount: string;
    bankCode: string;
  } | null>(null);
  const pollTimer = useRef<number | null>(null);

  // Pre-fill phone/email from the signed-in user, then clear when dialog opens fresh.
  useEffect(() => {
    if (!group) {
      setStep("form");
      setMandate(null);
      if (pollTimer.current) { window.clearInterval(pollTimer.current); pollTimer.current = null; }
      return;
    }
    (async () => {
      try {
        const { data } = await client.auth.getUser();
        const email = data?.user?.email || "";
        const phone = (data?.user?.user_metadata as any)?.phone || (data?.user?.phone as string) || "";
        setForm((f) => ({ ...f, email: f.email || email, phone: f.phone || phone }));
      } catch { /* non-fatal */ }
    })();
  }, [group, client]);

  // Poll mandate status every 60s while waiting for the bank.
  useEffect(() => {
    if (step !== "nibss" || !group) return;
    pollTimer.current = window.setInterval(async () => {
      const res = await products.checkGroupMandateStatus(group.id);
      if (res?.data?.bank_approved) {
        if (pollTimer.current) window.clearInterval(pollTimer.current);
        setStep("active");
        toast({ title: "Mandate Approved", description: "Your bank has approved the Direct Debit Mandate." });
        onAuthorized?.();
      }
    }, 60_000);
    return () => { if (pollTimer.current) window.clearInterval(pollTimer.current); };
  }, [step, group, products, toast, onAuthorized]);

  const selectedBank = useMemo(() => VFD_BANKS.find((b) => b.code === form.bankCode), [form.bankCode]);

  const mandateAmount = group ? Math.max(1000, Number(group.contribution_amount) || 0) : 0;
  const aboveMin = group ? Number(group.contribution_amount) >= 1000 : true;

  const submit = async () => {
    if (!group) return;
    if (!form.bankCode || !/^\d{10}$/.test(form.accountNumber) || !form.phone || !form.email || !form.address) {
      toast({ title: "Missing info", description: "Bank, 10-digit account, phone, email and address are required.", variant: "destructive" });
      return;
    }
    if (!aboveMin) {
      toast({ title: "Below minimum", description: "VFD requires a minimum mandate amount of ₦1,000. Update the group's contribution amount first.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const res = await products.acceptGroupMandate(group.id, {
      payer_bank_code: form.bankCode,
      payer_account_number: form.accountNumber,
      payer_phone: form.phone,
      payer_email: form.email,
      payer_address: form.address,
    });
    setBusy(false);
    if (!res?.data?.success) return; // toast handled in invoke()
    setMandate({
      reference: res.data.mandate_reference,
      code: res.data.mandate_code,
      nibssAccount: res.data.nibss_account || "",
      nibssMessage: res.data.nibss_message || "",
      payerAccount: res.data.payer_account_number,
      bankCode: res.data.payer_bank_code,
    });
    setStep("nibss");
  };

  const copy = (val: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val).then(
      () => toast({ title: "Copied", description: val }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };

  const recheckNow = async () => {
    if (!group) return;
    setBusy(true);
    const res = await products.checkGroupMandateStatus(group.id);
    setBusy(false);
    if (res?.data?.bank_approved) {
      setStep("active");
      toast({ title: "Mandate Approved", description: "Bank has approved your DDM." });
      onAuthorized?.();
    } else {
      toast({ title: "Still pending", description: "Your bank has not approved the mandate yet. We'll keep checking in the background." });
    }
  };

  return (
    <Dialog open={!!group} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {step === "form" && group && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">Set Up Direct Debit Mandate</DialogTitle>
              <DialogDescription className="text-xs">
                Authorize VFD to debit your bank account for each contribution to {group.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-muted/40 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Group</span><span className="font-medium">{group.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Per-cycle amount</span><span className="font-medium">₦{fmt(mandateAmount)} / {periodLabel(group.period).toLowerCase()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Frequency</span><span className="font-medium">{periodLabel(group.period)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cycles</span><span className="font-medium">{group.total_cycles || group.max_members}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span className="font-medium">Today</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">End (approx)</span><span className="font-medium">{computeEndDateDisplay(group.period, group.total_cycles || group.max_members)}</span></div>
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
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="08012345678" className="h-10" />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="you@email.com" className="h-10" />
                </div>
                <div>
                  <Label className="text-xs">Address</Label>
                  <Input value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="Your residential address" className="h-10" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                <p className="font-semibold text-amber-700 dark:text-amber-400">₦50 NIBSS authorization charge</p>
                <p className="text-muted-foreground">After setup we'll show an account to send ₦50 to. The transfer must come from the exact account above within 7 days, or the mandate expires.</p>
              </div>

              <p className="text-[10px] text-muted-foreground">
                A one-time ₦100 setup fee will be debited from your Vestara wallet now.
              </p>
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

        {step === "nibss" && mandate && group && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Check className="h-4 w-4 text-success" /> Mandate Created — Authorization Required
              </DialogTitle>
              <DialogDescription className="text-xs">
                To activate your Direct Debit Mandate, send ₦50 from your bank account ending in <span className="font-mono">{mandate.payerAccount.slice(-4)}</span> to the NIBSS account below.
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
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-bold">₦50.00</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-mono">{selectedBank?.name || mandate.bankCode} • {mandate.payerAccount}</span>
                </div>
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
                <span>Reference</span>
                <span className="font-mono">{mandate.reference}</span>
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

        {step === "active" && group && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Check className="h-4 w-4 text-success" /> Direct Debit Active
              </DialogTitle>
              <DialogDescription className="text-xs">
                Your mandate for {group.name} is bank-authorized and ready to debit on each cycle.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <Badge variant="success" className="text-sm">🔵 DDM Active</Badge>
            </div>
            <Button onClick={onClose} className="h-11 w-full">Done</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
