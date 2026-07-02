import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Wallet, ShieldCheck } from "lucide-react";
import { useVfdBanking } from "@/hooks/useVfdBanking";

export interface TransferQuote {
  tier: number;
  tier_label: string;
  wallet_balance: number;
  free_quota: number;
  used_this_month: number;
  free_remaining: number;
  transfer_fee: number;
  stamp_duty: number;
  total_fees: number;
  amount: number;
  total_debit: number;
  transferType: "intra" | "inter";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toAccount: string;
  bankCode: string;
  bankName: string;
  beneficiaryName: string;
  amount: number;
  narration: string;
  onConfirm: () => void;
}

const fmt = (n: number) => `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TransferPreviewSheet({
  open, onOpenChange, toAccount, bankCode, bankName, beneficiaryName, amount, narration, onConfirm,
}: Props) {
  const { quoteTransfer } = useVfdBanking();
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQuote(null);
    setError(null);
    setLoading(true);
    (async () => {
      const r = await quoteTransfer({ toAccount, bankCode, amount });
      if (cancelled) return;
      setLoading(false);
      if (r?.data) setQuote(r.data as TransferQuote);
      else setError("Could not load fees. Please try again.");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, toAccount, bankCode, amount]);

  const insufficient = quote && quote.total_debit > quote.wallet_balance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm Transfer</DialogTitle>
          <DialogDescription>Review the details below before authorizing with your PIN.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Beneficiary */}
          <div className="rounded-2xl border border-border/50 bg-muted/30 p-4 space-y-1">
            <p className="text-xs text-muted-foreground">To</p>
            <p className="font-semibold text-foreground">{beneficiaryName || toAccount}</p>
            <p className="text-xs text-muted-foreground">{bankName} • {toAccount}</p>
            {narration && <p className="text-xs text-muted-foreground italic mt-1">"{narration}"</p>}
          </div>

          {/* Amount */}
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="text-3xl font-bold text-foreground">{fmt(amount)}</p>
          </div>

          {/* Breakdown */}
          {loading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calculating fees…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 text-destructive p-3 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {quote && !loading && (
            <div className="rounded-2xl border border-border/50 p-4 space-y-2 text-sm">
              <Row label="Amount" value={fmt(quote.amount)} />
              {quote.transferType === "inter" ? (
                <>
                  <Row
                    label="Transfer fee"
                    value={quote.transfer_fee === 0 ? "Free" : fmt(quote.transfer_fee)}
                    sub={
                      quote.free_quota === -1
                        ? "Tier 4 — unlimited free transfers"
                        : quote.free_quota === 0
                          ? `${quote.tier_label} — ₦20 per transfer`
                          : quote.free_remaining > 0
                            ? `${quote.tier_label} — ${quote.free_remaining} free left this month`
                            : `${quote.tier_label} — free quota used`
                    }
                  />
                  <Row label="Stamp duty" value={fmt(quote.stamp_duty)} sub="Per interbank transfer" />
                </>
              ) : (
                <Row label="Fees" value="Free" sub="Vestara-to-Vestara transfer" />
              )}
              <div className="border-t border-border/50 pt-2 mt-2">
                <Row label="Total debit" value={fmt(quote.total_debit)} highlight />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <Wallet className="h-3 w-3" />
                  Wallet balance: {fmt(quote.wallet_balance)}
                </div>
              </div>
              {insufficient && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 text-destructive p-2.5 text-xs mt-2">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Insufficient balance. You need {fmt(quote.total_debit - quote.wallet_balance)} more
                    to cover the amount plus fees.
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              variant="hero"
              disabled={loading || !!error || !quote || !!insufficient}
              onClick={() => { onOpenChange(false); onConfirm(); }}
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Enter PIN
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={highlight ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <p className={highlight ? "font-bold text-foreground text-base" : "font-medium text-foreground"}>{value}</p>
    </div>
  );
}
