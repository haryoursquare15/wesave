import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VestaraSavings as VS } from "@/hooks/useVestaraLedger";
import type { MandateRow } from "@/hooks/useMandates";

const naira = (v: number, dp = 0) =>
  `₦${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: dp })}`;

/** One date format everywhere: 19 Oct 2026. */
export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export type PlanState =
  | "pending" | "setup" | "attention" | "rejected" | "active" | "ready" | "matured" | "closed" | "expired";

/** Plans in these states are historical — never mixed with live plans. */
export const ARCHIVED_STATES: PlanState[] = ["matured", "closed", "rejected", "expired"];

export type SaveTab = "active" | "pending" | "closed";

const MANDATE_LIVE = new Set(["bank_approved", "authorized"]);
const MANDATE_BAD = new Set(["failed", "expired", "cancelled"]);

export function planState(s: VS, mandate?: MandateRow | null): PlanState {
  if (s.activation_status === "expired") return "expired";
  if (s.approval_status === "pending") return "pending";
  if (s.approval_status === "rejected") return "rejected";
  if (s.status === "matured") return "matured";
  if (s.status === "early_withdrawn" || s.status === "cancelled") return "closed";
  // Never show "Active" until the bank has confirmed the mandate.
  if (s.activation_status === "pending_mandate") {
    if (mandate && MANDATE_BAD.has(mandate.status)) return "attention";
    if (!mandate || !MANDATE_LIVE.has(mandate.status)) return "setup";
  }
  if (s.status === "active" && new Date() >= new Date(s.maturity_date)) return "ready";
  return "active";
}

export function saveTabOf(s: VS): SaveTab {
  const st = planState(s);
  if (ARCHIVED_STATES.includes(st)) return "closed";
  if (st === "pending" || st === "setup" || st === "attention") return "pending";
  return "active";
}

const STATE_META: Record<PlanState, { label: string; chip: string }> = {
  pending: { label: "Awaiting review", chip: "bg-muted text-muted-foreground" },
  setup: { label: "Setup pending", chip: "bg-accent text-accent-foreground" },
  attention: { label: "Needs attention", chip: "bg-destructive/10 text-destructive" },
  rejected: { label: "Not approved", chip: "bg-destructive/10 text-destructive" },
  active: { label: "Active", chip: "bg-accent text-accent-foreground" },
  ready: { label: "Matured", chip: "bg-success/10 text-success" },
  matured: { label: "Matured", chip: "bg-success/10 text-success" },
  closed: { label: "Closed", chip: "bg-muted text-muted-foreground" },
  expired: { label: "Expired", chip: "bg-muted text-muted-foreground" },
};

interface Props {
  savings: VS;
  mandate?: MandateRow | null;
  busy?: boolean;
  onMature: (s: VS) => void;
  onEarlyWithdraw: (s: VS) => void;
  onTryAgain?: (s: VS) => void;
  onOpenMandate?: (m: MandateRow) => void;
  onLinkBank?: () => void;
}

export function SavingsPlanCard({ savings: s, mandate, busy, onMature, onEarlyWithdraw, onTryAgain, onOpenMandate, onLinkBank }: Props) {
  const [open, setOpen] = useState(false);
  const state = planState(s, mandate);
  const meta = STATE_META[state];
  const isClosed = ARCHIVED_STATES.includes(state);

  const name = String((s.metadata as Record<string, unknown>)?.goal_name || s.vestara_products?.name || "Savings plan");
  const principal = Number(s.principal || 0);
  const interest = Number(s.discounted_interest_paid || 0) > 0
    ? Number(s.discounted_interest_paid)
    : Number(s.accrued_interest || 0);

  const commitment = Number(s.commitment_amount || 0);
  const installments = Number(s.tenor_count || 0);
  const targetAmount = commitment > 0 && installments > 0 ? commitment * installments : 0;
  const isRecurring = targetAmount > 0;
  const collectedCount = isRecurring ? Math.floor(principal / commitment) : 0;

  const startMs = new Date(s.start_date).getTime();
  const endMs = new Date(s.maturity_date).getTime();
  const progress = isRecurring
    ? Math.min(100, (principal / targetAmount) * 100)
    : state === "active" || state === "ready"
      ? Math.min(100, Math.max(0, ((Date.now() - startMs) / Math.max(1, endMs - startMs)) * 100))
      : 0;

  const allowEarly = s.vestara_products?.allow_early_withdrawal ?? false;
  const mandateAwaitingTransfer = mandate && mandate.status === "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("rounded-[20px] border border-border bg-card", isClosed && "opacity-75")}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold truncate">{name}</p>
          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium", meta.chip)}>{meta.label}</span>
        </div>

        <div>
          <p className="text-2xl font-bold tabular-nums leading-tight">{naira(principal, 2)}</p>
          {isRecurring && (
            <p className="text-xs text-muted-foreground mt-0.5">
              of {naira(targetAmount)} · {collectedCount} of {installments} debits
            </p>
          )}
        </div>

        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{state === "ready" || state === "matured" ? "Matured" : "Matures"} {fmtDate(s.maturity_date)}</span>
          {interest > 0 && <span className="text-success font-medium">+{naira(interest, 2)} interest</span>}
        </div>

        {state === "expired" && (
          <p className="text-xs text-muted-foreground leading-snug">
            The bank authorization wasn't completed in time, so this plan closed. Any setup fee was refunded.
          </p>
        )}
        {state === "attention" && mandate?.rejection_reason && (
          <p className="text-xs text-destructive leading-snug">{mandate.rejection_reason}</p>
        )}

        {/* ONE action, only when relevant */}
        {(state === "setup" || state === "attention") && mandate && onOpenMandate && (
          <Button className="w-full h-11 rounded-2xl active:scale-[0.96] transition-transform" variant={mandateAwaitingTransfer ? "default" : "outline"} onClick={() => onOpenMandate(mandate)}>
            {mandateAwaitingTransfer ? "Authorize bank account" : "View status"}
          </Button>
        )}
        {state === "setup" && !mandate && onLinkBank && (
          <Button className="w-full h-11 rounded-2xl active:scale-[0.96] transition-transform" onClick={onLinkBank}>
            Authorize bank account
          </Button>
        )}
        {state === "ready" && (
          <Button className="w-full h-11 rounded-2xl" onClick={() => onMature(s)} disabled={busy}>Withdraw to wallet</Button>
        )}
        {state === "expired" && onTryAgain && (
          <Button variant="outline" className="w-full h-11 rounded-2xl" onClick={() => onTryAgain(s)}>
            <RotateCcw className="h-4 w-4 mr-2" /> Start a new plan
          </Button>
        )}

        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Details <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="border-t border-border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Detail label="Interest rate (estimated)" value={`${Number(s.user_rate).toFixed(2)}% p.a. on saved amount`} />
            <Detail label="Tenor" value={`${s.tenor_days} days`} />
            <Detail label="Start" value={fmtDate(s.start_date)} />
            <Detail label="Matures" value={fmtDate(s.maturity_date)} />
            {isRecurring && <Detail label="Each debit" value={`${naira(commitment)} ${s.commitment_frequency || ""}`} />}
            {s.next_debit_at && state === "active" && <Detail label="Next debit" value={fmtDate(s.next_debit_at)} />}
            {s.approval_notes && <Detail label="Note" value={s.approval_notes} />}
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-0.5">Rules</p>
            {allowEarly
              ? `Early exit allowed. You get your saved amount back in full; up to ${s.vestara_products?.early_withdrawal_penalty_pct ?? 0}% of interest earned is deducted.`
              : "Funds stay locked until the maturity date."}
          </div>
          {state === "active" && (allowEarly ? (
            <Button variant="outline" size="sm" className="rounded-[14px]" onClick={() => onEarlyWithdraw(s)} disabled={busy}>Exit early</Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Locked till maturity</span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
