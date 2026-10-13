import { useState } from "react";
import { Wallet, Landmark, ChevronDown, ShieldCheck, FileText } from "lucide-react";
import type { VestaraProduct, VestaraProductCode } from "@/hooks/useVestaraLedger";
import { cn } from "@/lib/utils";

/** Funding source per product — GoalSave debits the linked bank via mandate; others fund from wallet. */
export const FUNDING: Record<VestaraProductCode, { label: string; short: string; bank: boolean; detail: string }> = {
  goalsave: {
    label: "Bank direct debit",
    short: "Bank debit",
    bank: true,
    detail: "Funded by automatic debits from your bank account. A one-time ₦100 bank authorization (mandate) is required before the plan starts.",
  },
  vault: { label: "Vestara wallet", short: "Wallet", bank: false, detail: "Funded once from your Vestara wallet balance when you create the plan." },
  lockmax: { label: "Vestara wallet", short: "Wallet", bank: false, detail: "Funded once from your Vestara wallet balance when you create the plan." },
  upfront_yield: { label: "Vestara wallet", short: "Wallet", bank: false, detail: "Funded once from your Vestara wallet balance when you create the plan." },
};

const ABOUT: Record<VestaraProductCode, string> = {
  goalsave: "Save toward a goal with scheduled daily, weekly or monthly contributions that earn interest until maturity.",
  vault: "Lock a lump sum for a fixed period and earn daily interest on it.",
  lockmax: "Lock a lump sum for longer to earn our highest fixed returns.",
  upfront_yield: "Lock a lump sum and receive your interest upfront, as soon as the plan starts.",
};

export function FundingChip({ code, className }: { code: VestaraProductCode; className?: string }) {
  const f = FUNDING[code];
  if (!f) return null;
  const Icon = f.bank ? Landmark : Wallet;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] font-medium text-foreground", className)}>
      <Icon className="h-3 w-3 text-primary" />
      Funded by: {f.short}
    </span>
  );
}

function withdrawalText(p: VestaraProduct) {
  if (p.code === "goalsave" && !p.allow_early_withdrawal) return "Funds stay locked until the maturity date, then are paid to your wallet with interest.";
  if (!p.allow_early_withdrawal) return "No early withdrawal. Principal and interest are paid to your wallet on the maturity date.";
  return "You can withdraw before maturity. At maturity, principal and interest are paid to your wallet.";
}

function penaltyText(p: VestaraProduct) {
  if (!p.allow_early_withdrawal) return "Early exit is not available, so no early-withdrawal penalty applies.";
  if (p.early_withdrawal_penalty_pct > 0) {
    return p.is_upfront_yield
      ? `Exiting early attracts a ${p.early_withdrawal_penalty_pct}% penalty, and any interest already paid upfront is recovered.`
      : `Exiting early attracts a ${p.early_withdrawal_penalty_pct}% penalty on accrued interest.`;
  }
  return "No penalty for early withdrawal.";
}

export function ProductTermsBox({ product, defaultOpen = false }: { product: VestaraProduct; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const f = FUNDING[product.code];
  const rows = [
    { t: "About this plan", d: product.description || ABOUT[product.code] },
    { t: "How it's funded", d: f?.detail },
    { t: "Withdrawal", d: withdrawalText(product) },
    { t: "Penalty", d: penaltyText(product) },
    { t: "Returns", d: `${product.min_user_rate}–${product.max_user_rate}% p.a., depending on duration. Rates shown are before applicable taxes.` },
  ];
  return (
    <div className="rounded-2xl border border-border bg-muted/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-[44px]"
        aria-expanded={open}
      >
        <span className="h-8 w-8 rounded-xl bg-accent flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-primary" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold">Terms & conditions</span>
          <span className="block text-[11px] text-muted-foreground truncate">Funding, withdrawal and penalty for {product.name}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
          {rows.map(r => (
            <div key={r.t} className="flex gap-2.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">{r.t}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{r.d}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
