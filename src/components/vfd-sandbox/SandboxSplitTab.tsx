import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useVestaraLedger } from "@/hooks/useVestaraLedger";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import {
  Receipt, Plus, RefreshCw, CreditCard, ArrowLeft, CheckCircle,
  XCircle, Ban, Info, AlertTriangle, UserPlus, Share2, Copy, Check, Wallet,
} from "lucide-react";
import { format } from "date-fns";

const NIGERIAN_BANKS = [
  "Access Bank", "Citibank", "Ecobank", "Fidelity Bank", "First Bank",
  "FCMB", "GTBank", "Heritage Bank", "Keystone Bank", "Kuda Bank",
  "Moniepoint MFB", "OPay", "Palmpay", "Polaris Bank", "Providus Bank",
  "Stanbic IBTC", "Sterling Bank", "UBA", "Union Bank", "Unity Bank",
  "VFD MFB", "Wema Bank", "Zenith Bank",
];

interface Split {
  id: string; title: string; total_amount: number; split_count: number;
  per_person_amount: number; paid_count: number; status: string;
  merchant_name: string | null; creator_id: string;
  fee_per_person?: number; purpose?: string;
  vfd_sandbox_split_participants?: { user_id: string; status: string; amount_due?: number; paid_at?: string }[];
}

const PLATFORM_FEE = 100;
const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

export function SandboxSplitTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const { getBalanceSummary } = useVestaraLedger();
  const { session } = useSandboxAwareAuth();
  const currentUserId = session?.user?.id;
  const [splits, setSplits] = useState<Split[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const [form, setForm] = useState({
    purpose: "", total_amount: "", split_count: "2",
    merchant_name: "", merchant_bank_name: "", merchant_account_number: "",
    expiry_date: "",
  });

  const totalAmount = parseFloat(form.total_amount) || 0;
  const splitCount = parseInt(form.split_count) || 0;
  const amountPerPerson = splitCount > 0 ? Math.ceil((totalAmount / splitCount) * 100) / 100 : 0;
  const feePerPerson = splitCount > 0 ? Math.ceil((PLATFORM_FEE / splitCount) * 100) / 100 : 0;
  const totalPerPerson = amountPerPerson + feePerPerson;

  const loadSplits = async () => {
    const result = await products.listSplits();
    if (result?.data) setSplits(result.data);
  };

  const refreshWallet = async () => {
    const summary = await getBalanceSummary();
    if (summary) setWalletBalance(summary.wallet);
  };

  useEffect(() => { loadSplits(); refreshWallet(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    if (!form.purpose.trim()) { toast({ title: "Purpose is required", variant: "destructive" }); return; }
    if (totalAmount < 1000) { toast({ title: "Minimum ₦1,000", description: "The total bill must be at least ₦1,000.", variant: "destructive" }); return; }
    if (splitCount < 2) { toast({ title: "Need at least 2 participants", variant: "destructive" }); return; }
    if (!form.merchant_name.trim() || !form.merchant_bank_name || !form.merchant_account_number) {
      toast({ title: "Merchant bank details required", description: "Add the merchant's account name, bank, and 10-digit account number.", variant: "destructive" });
      return;
    }
    if (form.merchant_account_number.length !== 10) {
      toast({ title: "Account number must be 10 digits", variant: "destructive" }); return;
    }

    const result = await products.createSplit({
      title: form.purpose,
      total_amount: totalAmount,
      split_count: splitCount,
      merchant_name: form.merchant_name,
      merchant_account_name: form.merchant_name,
      merchant_bank_name: form.merchant_bank_name,
      merchant_account_number: form.merchant_account_number,
      purpose: form.purpose,
    });
    if (result?.data) {
      toast({ title: "Split Created!", description: "Share the link with participants. Funds auto-transfer to the merchant once everyone has paid." });
      setForm({ purpose: "", total_amount: "", split_count: "2", merchant_name: "", merchant_bank_name: "", merchant_account_number: "", expiry_date: "" });
      setShowCreate(false);
      await loadSplits();
    }
  };

  const loadDetail = async (id: string) => {
    const result = await products.getSplitDetail(id);
    if (result?.data) { setDetailData(result.data); setDetailId(id); refreshWallet(); }
  };

  // Detail view
  if (detailId && detailData) {
    const s = detailData.split || detailData;
    const participants = detailData.participants || s.vfd_sandbox_split_participants || [];
    const paidCount = participants.filter((p: any) => p.status === "paid").length;
    const activeCount = participants.filter((p: any) => p.status !== "declined").length;
    const slotsRemaining = Math.max(Number(s.split_count) - activeCount, 0);
    const perPerson = Number(s.per_person_amount);
    const fee = Number(s.fee_per_person || 0);
    const totalDue = perPerson + fee;
    const isCreator = currentUserId === s.creator_id;
    const myParticipation = participants.find((p: any) => p.user_id === currentUserId);
    const hasEnoughBalance = walletBalance === null || walletBalance >= totalDue;
    const payBlockedReason = !hasEnoughBalance ? "Insufficient balance" : null;
    const remainingPayments = Math.max(Number(s.split_count) - paidCount, 0);

    return (
      <div className="space-y-4">
        <button onClick={() => { setDetailId(null); setDetailData(null); }} className="text-sm text-primary flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to Splits
        </button>

        {/* Summary */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{s.title || s.purpose}</h3>
              <Badge variant="outline" className={
                s.status === "active" ? "text-amber-600 border-amber-500" :
                s.status === "completed" ? "text-green-600 border-green-500" :
                s.status === "settling" ? "text-blue-600 border-blue-500" : "text-muted-foreground"
              }>{s.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-xl bg-primary/5">
                <p className="text-xs text-muted-foreground">Total Bill</p>
                <p className="text-lg font-bold">₦{fmt(Number(s.total_amount))}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/5">
                <p className="text-xs text-muted-foreground">Your Share + Fee</p>
                <p className="text-lg font-bold">₦{fmt(totalDue)}</p>
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-2">
              <span>Bill share: ₦{fmt(perPerson)}</span>
              <span>Platform fee: ₦{fmt(fee)}</span>
            </div>
            {s.merchant_account_name && (
              <div className="text-xs text-muted-foreground border-t border-border pt-2">
                <p className="font-semibold text-foreground">Merchant: {s.merchant_account_name}</p>
                {s.merchant_bank_name && <p>{s.merchant_bank_name} — {s.merchant_account_number}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wallet balance check (WeSave parity) */}
        {s.status === "active" && myParticipation?.status === "pending" && walletBalance !== null && (
          <div className={`rounded-xl p-3 border ${hasEnoughBalance ? "bg-secondary/10 border-secondary/20" : "bg-destructive/10 border-destructive/20"}`}>
            <p className="text-sm font-semibold flex items-center gap-1">
              <Wallet className="h-4 w-4" />
              {hasEnoughBalance ? "Ready to pay" : "Insufficient balance"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Wallet: ₦{fmt(walletBalance)} · Required: ₦{fmt(totalDue)} (₦{fmt(perPerson)} + ₦{fmt(fee)} fee)
            </p>
            {!hasEnoughBalance && (
              <p className="text-xs text-destructive mt-1">
                Fund your wallet from the Fund tab to pay your share.
              </p>
            )}
          </div>
        )}

        {/* Group progress */}
        {s.status === "active" && slotsRemaining > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">{activeCount} of {s.split_count} participants joined</p>
              <p className="text-xs text-muted-foreground">{paidCount} paid so far. Settlement happens when all {s.split_count} have paid.</p>
            </div>
          </div>
        )}

        {/* Invite participants — share link */}
        {s.status === "active" && slotsRemaining > 0 && isCreator && (
          <SplitInviteBlock splitId={s.id} title={s.title || s.purpose} />
        )}

        {/* Action buttons (WeSave parity: only when I'm a pending participant) */}
        {s.status === "active" && myParticipation?.status === "pending" && (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={products.loading || Boolean(payBlockedReason)} onClick={async () => {
              const r = await products.paySplit(s.id);
              if (r?.data) {
                const allPaid = r.data.all_paid;
                toast({
                  title: "Payment successful!",
                  description: allPaid
                    ? "All participants paid — merchant settlement processing."
                    : `Your share of ₦${fmt(totalDue)} was paid.`,
                });
                await Promise.all([loadDetail(s.id), refreshWallet()]);
              }
            }}>
              <CreditCard className="h-4 w-4 mr-1" />
              {payBlockedReason || `Accept & Pay ₦${fmt(totalDue)}`}
            </Button>
            <Button variant="outline" className="flex-1" onClick={async () => {
              await products.declineSplit(s.id);
              toast({ title: "Declined", description: "You have declined this split." });
              loadDetail(s.id);
            }} disabled={products.loading}>
              Decline
            </Button>
          </div>
        )}

        {/* Paid confirmation */}
        {myParticipation?.status === "paid" && (
          <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4 text-center">
            <CheckCircle className="h-6 w-6 text-secondary mx-auto mb-1" />
            <p className="font-semibold">You've paid your share</p>
            <p className="text-xs text-muted-foreground">
              ₦{fmt(totalDue)}{myParticipation.paid_at ? ` on ${format(new Date(myParticipation.paid_at), "MMM d, HH:mm")}` : ""}
            </p>
            {s.status === "active" && remainingPayments > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Waiting for {remainingPayments} more payment{remainingPayments > 1 ? "s" : ""} before merchant settlement.
              </p>
            )}
          </div>
        )}

        {/* Declined confirmation */}
        {myParticipation?.status === "declined" && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center">
            <XCircle className="h-6 w-6 text-destructive mx-auto mb-1" />
            <p className="font-semibold">You declined this split</p>
          </div>
        )}

        {/* Settlement complete */}
        {s.status === "completed" && s.settlement_status === "completed" && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
            <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
            <p className="font-semibold">Settlement complete</p>
            <p className="text-xs text-muted-foreground">Funds transferred to {s.merchant_account_name}.</p>
          </div>
        )}

        {/* Participants */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Participants ({participants.length}/{s.split_count})</h4>
          <div className="space-y-2">
            {participants.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                <span className="font-medium truncate max-w-[160px]">
                  {p.display_name || `User ${p.user_id?.slice(0, 6)}`}
                  {p.user_id === s.creator_id && <span className="ml-1 text-[10px] text-primary">(creator)</span>}
                  {p.user_id === currentUserId && <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>}
                </span>
                <div className="flex items-center gap-2">
                  {p.status === "paid" && (
                    <>
                      <CheckCircle className="h-3 w-3 text-green-600" />
                      <span className="text-green-600">Paid</span>
                      {p.paid_at && <span className="text-muted-foreground">{format(new Date(p.paid_at), "MMM d")}</span>}
                    </>
                  )}
                  {p.status === "pending" && <Badge variant="outline" className="text-[10px]">Pending</Badge>}
                  {p.status === "declined" && (
                    <>
                      <XCircle className="h-3 w-3 text-destructive" />
                      <span className="text-destructive">Declined</span>
                    </>
                  )}
                  {/* Creator can remove pending participants — but never themselves */}
                  {isCreator && p.status === "pending" && s.status === "active" && p.user_id !== s.creator_id && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive text-[10px]" onClick={async () => {
                      await products.removeSplitParticipant(s.id, p.user_id);
                      toast({ title: "Removed" });
                      loadDetail(s.id);
                    }} disabled={products.loading}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {Array.from({ length: Math.max(0, Number(s.split_count) - participants.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="flex items-center justify-center text-xs p-2 rounded-lg border border-dashed border-border text-muted-foreground">
                Waiting for participant...
              </div>
            ))}
          </div>
        </div>

        {/* Cancel */}
        {isCreator && s.status === "active" && (
          <div className="space-y-2">
            {paidCount > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                ⚠️ Cancelling will refund {paidCount} participant{paidCount > 1 ? "s" : ""} who already paid.
              </p>
            )}
            <Button variant="destructive" className="w-full" onClick={async () => {
              const r = await products.cancelSplit(s.id);
              if (r?.data) { toast({ title: "Split cancelled" }); setDetailId(null); setDetailData(null); loadSplits(); refreshWallet(); }
            }} disabled={products.loading}>
              <Ban className="h-4 w-4 mr-1" /> Cancel Split Request
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" /> SplitPay
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadSplits}><RefreshCw className="h-3 w-3" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="h-3 w-3 mr-1" /> New Split</Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Bill Split</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Purpose of Payment *</Label>
              <Input value={form.purpose} onChange={(e) => setForm(p => ({ ...p, purpose: e.target.value }))} placeholder="e.g., Dinner at Nkoyo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Total Bill (₦) *</Label>
                <Input type="number" min={1000} value={form.total_amount} onChange={(e) => setForm(p => ({ ...p, total_amount: e.target.value }))} placeholder="50,000" />
              </div>
              <div>
                <Label>Total People (incl. you)</Label>
                <Input type="number" min={2} max={50} value={form.split_count} onChange={(e) => setForm(p => ({ ...p, split_count: e.target.value }))} placeholder="5" />
              </div>
            </div>

            {/* Fee breakdown */}
            {amountPerPerson > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Amount per person</p>
                  <p className="text-2xl font-bold text-primary">₦{fmt(totalPerPerson)}</p>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground border-t border-primary/10 pt-2">
                  <span>Bill share: ₦{fmt(amountPerPerson)}</span>
                  <span>Platform fee: ₦{fmt(feePerPerson)}</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Includes you + {Math.max(0, splitCount - 1)} {splitCount - 1 === 1 ? "other person" : "others"}
                </p>
              </div>
            )}

            {/* Merchant Bank Details */}
            <div className="border-t border-border pt-3 space-y-3">
              <h4 className="text-sm font-semibold">Merchant Bank Details *</h4>
              <p className="text-xs text-muted-foreground">Once every participant pays, the full bill is auto-transferred to this account.</p>
              <div>
                <Label>Account Name</Label>
                <Input value={form.merchant_name} onChange={(e) => setForm(p => ({ ...p, merchant_name: e.target.value }))} placeholder="e.g. Nkoyo Restaurant Ltd" />
              </div>
              <div>
                <Label>Bank</Label>
                <Select value={form.merchant_bank_name} onValueChange={(v) => setForm(p => ({ ...p, merchant_bank_name: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>
                    {NIGERIAN_BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Account Number (10 digits)</Label>
                <Input value={form.merchant_account_number} onChange={(e) => setForm(p => ({ ...p, merchant_account_number: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="0123456789" maxLength={10} inputMode="numeric" />
              </div>
            </div>

            <Button onClick={handleCreate} disabled={products.loading || !form.purpose || !form.total_amount} className="w-full">
              {products.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Split Request
            </Button>
          </CardContent>
        </Card>
      )}

      {splits.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No splits yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {splits.map((s) => (
            <Card key={s.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => loadDetail(s.id)}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{s.title || s.purpose}</p>
                    <p className="text-xs text-muted-foreground">
                      ₦{fmt(Number(s.total_amount))} • {s.paid_count}/{s.split_count} paid
                      {s.merchant_name && ` • ${s.merchant_name}`}
                    </p>
                  </div>
                  <Badge variant="outline" className={
                    s.status === "active" ? "text-amber-600 border-amber-500" :
                    s.status === "completed" ? "text-green-600 border-green-500" :
                    s.status === "settling" ? "text-blue-600 border-blue-500" : "text-muted-foreground"
                  }>
                    {s.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Your share:</span>
                  <span className="font-semibold">₦{fmt(Number(s.per_person_amount) + Number(s.fee_per_person || 0))}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Inline share/invite block for a split ─── */
function SplitInviteBlock({ splitId, title }: { splitId: string; title: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/vfd-sandbox?split=${splitId}`;
  const text = `Join me to split the bill for "${title}" on Vestara: ${link}`;

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async (channel: "whatsapp" | "twitter" | "telegram" | "email" | "native") => {
    const encoded = encodeURIComponent(text);
    if (channel === "native" && navigator.share) {
      try { await navigator.share({ title: `Split: ${title}`, text, url: link }); } catch { /* cancelled */ }
      return;
    }
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encoded}`,
      twitter: `https://twitter.com/intent/tweet?text=${encoded}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
      email: `mailto:?subject=${encodeURIComponent(`Split: ${title}`)}&body=${encoded}`,
    };
    window.open(urls[channel], "_blank", "noopener,noreferrer");
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Invite participants</p>
        </div>
        <div className="flex gap-2">
          <Input value={link} readOnly className="text-xs" />
          <Button variant="outline" size="icon" onClick={copy} title="Copy link">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Button variant="outline" size="sm" onClick={() => share("whatsapp")}>WhatsApp</Button>
          <Button variant="outline" size="sm" onClick={() => share("twitter")}>X</Button>
          <Button variant="outline" size="sm" onClick={() => share("telegram")}>Telegram</Button>
          <Button variant="outline" size="sm" onClick={() => share("email")}>Email</Button>
        </div>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => share("native")}>
            <Share2 className="h-3 w-3 mr-1" /> More share options
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
