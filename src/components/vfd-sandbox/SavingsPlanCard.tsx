import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown, TrendingUp, Unlock, Lock, CalendarClock, RefreshCw, Timer, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { VestaraSavings as VS } from "@/hooks/useVestaraLedger";
import { MandateStatusCard } from "./MandateStatusCard";
import type { MandateRow } from "@/hooks/useMandates";

const naira = (v: number, dp = 0) =>
  `₦${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: dp })}`;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "2-digit" });

export type PlanState = "pending" | "rejected" | "active" | "ready" | "matured" | "closed" | "expired";

/** Plans in these states are historical — never mixed with live plans. */
export const ARCHIVED_STATES: PlanState[] = ["matured", "closed", "rejected", "expired"];

export function planState(s: VS): PlanState {
  // Mandate verification window closed without bank approval — permanent state.
  if (s.activation_status === "expired") return "expired";
  if (s.approval_status === "pending") return "pending";
  if (s.approval_status === "rejected") return "rejected";
  if (s.status === "matured") return "matured";
  if (s.status === "early_withdrawn" || s.status === "cancelled") return "closed";
  if (s.status === "active" && new Date() >= new Date(s.maturity_date)) return "ready";
  return "active";
}

const STATE_META: Record<PlanState, { label: string; badge: string; accent: string }> = {
  pending: { label: "Awaiting approval", badge: "bg-warning/10 text-warning border-warning/30", accent: "border-l-warning/60" },
  rejected: { label: "Rejected", badge: "bg-destructive/10 text-destructive border-destructive/30", accent: "border-l-destructive/60" },
  active: { label: "Active", badge: "bg-primary/10 text-primary border-primary/30", accent: "border-l-primary/60" },
  ready: { label: "Ready to withdraw", badge: "bg-success/10 text-success border-success/30", accent: "border-l-success/70" },
  matured: { label: "Matured", badge: "bg-success/10 text-success border-success/30", accent: "border-l-success/70" },
  closed: { label: "Closed", badge: "bg-muted text-muted-foreground border-border", accent: "border-l-border" },
  expired: { label: "Expired", badge: "bg-muted text-muted-foreground border-border", accent: "border-l-muted-foreground/40" },
};

interface Props {
  savings: VS;
  mandate?: MandateRow | null;
  busy?: boolean;
  onMature: (s: VS) => void;
  onEarlyWithdraw: (s: VS) => void;
  /** Starts a brand-new plan/mandate — the expired record is never revived. */
  onTryAgain?: (s: VS) => void;
}

export function SavingsPlanCard({ savings: s, mandate, busy, onMature, onEarlyWithdraw, onTryAgain }: Props) {
  const [open, setOpen] = useState(false);
  const state = planState(s);
  const meta = STATE_META[state];
  const isClosed = state === "closed" || state === "matured" || state === "rejected" || state === "expired";

  const principal = Number(s.principal || 0);
  const interest = Number(s.discounted_interest_paid || 0) > 0
    ? Number(s.discounted_interest_paid)
    : Number(s.accrued_interest || 0);

  // Recurring commitment plans build up principal installment by installment.
  const commitment = Number(s.commitment_amount || 0);
  const installments = Number(s.tenor_count || 0);
  const targetAmount = commitment > 0 && installments > 0 ? commitment * installments : 0;
  const isRecurring = targetAmount > 0;
  const collectedCount = isRecurring && commitment > 0 ? Math.floor(principal / commitment) : 0;

  const startMs = new Date(s.start_date).getTime();
  const endMs = new Date(s.maturity_date).getTime();
  const timeProgress = Math.min(100, Math.max(0, ((Date.now() - startMs) / Math.max(1, endMs - startMs)) * 100));
  const fundProgress = isRecurring ? Math.min(100, (principal / targetAmount) * 100) : 100;
  const daysLeft = Math.max(0, Math.ceil((endMs - Date.now()) / 86400000));

  const allowEarly = s.vestara_products?.allow_early_withdrawal ?? true;
  const awaitingMandate = s.activation_status === "pending_mandate";

  // VFD gives 7 days from mandate creation to fund the ₦50 NIBSS verification.
  const mandateExpiresAt = mandate?.expires_at || s.mandate_expires_at || null;
  const mandatePending = awaitingMandate && (!mandate || mandate.status === "pending");
  const verifyDaysLeft = mandatePending && mandateExpiresAt
    ? Math.ceil((new Date(mandateExpiresAt).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border border-border/50 border-l-[3px] bg-card overflow-hidden",
        meta.accent,
        isClosed && "opacity-70",
      )}
    >
      <div className="p-4 space-y-3">
        {/* Primary: amount + state */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isRecurring ? "Collected so far" : "Amount saved"}
            </p>
            <p className="text-2xl font-bold leading-tight tabular-nums">{naira(principal, 2)}</p>
            {isRecurring && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                of {naira(targetAmount)} target · {collectedCount}/{installments} {s.commitment_frequency || ""} debits
              </p>
            )}
          </div>
          <Badge variant="outline" className={cn("shrink-0 text-[10px] rounded-full px-2.5 py-0.5", meta.badge)}>
            {meta.label}
          </Badge>
        </div>

        {/* Progress — the second-most prominent element */}
        {(state === "active" || state === "ready") && (
          <div className="space-y-1.5">
            <Progress value={isRecurring ? fundProgress : timeProgress} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{Math.round(isRecurring ? fundProgress : timeProgress)}% complete</span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {state === "ready" ? "Matured" : `${daysLeft}d left · ${fmtDate(s.maturity_date)}`}
              </span>
            </div>
          </div>
        )}

        {/* Interest — compact single line */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1 text-success">
            <TrendingUp className="h-3 w-3" />
            {Number(s.discounted_interest_paid || 0) > 0 ? "Upfront" : "Accrued"} {naira(interest, 2)}
          </span>
          {awaitingMandate && (
            <span className="text-warning inline-flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Awaiting mandate approval
            </span>
          )}
          {Number(s.penalty_amount || 0) > 0 && (
            <span className="text-destructive">Penalty {naira(s.penalty_amount, 2)}</span>
          )}
        </div>

        {/* 7-day NIBSS verification countdown */}
        {verifyDaysLeft !== null && verifyDaysLeft > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-2 flex items-start gap-2">
            <Timer className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
            <p className="text-[11px] leading-snug">
              <span className="font-semibold">{verifyDaysLeft} day{verifyDaysLeft === 1 ? "" : "s"} left</span>{" "}
              to complete your ₦50 verification payment. After that your bank expires the mandate and
              this plan closes — your ₦100 setup fee is refunded automatically.
            </p>
          </div>
        )}

        {state === "expired" && (
          <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2 space-y-1.5">
            <p className="text-[11px] text-muted-foreground leading-snug">
              The ₦50 verification payment wasn't completed within 7 days, so your bank expired the
              mandate. This plan is kept for your records and any ₦100 setup fee was refunded.
            </p>
            {onTryAgain && (
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onTryAgain(s)}>
                <RotateCcw className="h-3 w-3 mr-1.5" /> Try again with a new plan
              </Button>
            )}
          </div>
        )}

        {/* Actions + details toggle */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Details
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>

          {state === "ready" ? (
            <Button size="sm" className="h-8 bg-success hover:bg-success/90 text-success-foreground" onClick={() => onMature(s)} disabled={busy}>
              <Unlock className="h-3.5 w-3.5 mr-1.5" /> Withdraw
            </Button>
          ) : state === "active" ? (
            allowEarly ? (
              <button
                type="button"
                onClick={() => onEarlyWithdraw(s)}
                disabled={busy}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-destructive transition-colors disabled:opacity-50"
              >
                Withdraw early
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" /> Locked till maturity
              </span>
            )
          ) : null}
        </div>
      </div>

      {/* Collapsed detail — static/repeated info lives here */}
      {open && (
        <div className="border-t border-border/50 bg-muted/20 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <Detail label="Rate" value={`${Number(s.user_rate).toFixed(2)}% p.a.`} />
            <Detail label="Tenor" value={`${s.tenor_days} days`} />
            <Detail label="Start" value={fmtDate(s.start_date)} />
            <Detail label="Maturity" value={fmtDate(s.maturity_date)} />
            {isRecurring && (
              <Detail label="Commitment" value={`${naira(commitment)} / ${s.commitment_frequency || "cycle"}`} />
            )}
            {s.next_debit_at && state === "active" && (
              <Detail label="Next debit" value={fmtDate(s.next_debit_at)} />
            )}
            {s.approval_notes && <Detail label="Note" value={s.approval_notes} />}
          </div>
          {mandate && <MandateStatusCard mandate={mandate} compact />}
        </div>
      )}
    </motion.div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
