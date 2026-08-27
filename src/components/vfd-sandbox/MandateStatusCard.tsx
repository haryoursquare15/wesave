import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Clock, AlertTriangle, CalendarDays, Timer } from "lucide-react";
import { mandateStatusMeta, type MandateRow } from "@/hooks/useMandates";

const fmtMoney = (n: number | null | undefined) =>
  `₦${new Intl.NumberFormat("en-NG").format(Number(n || 0))}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
};

const freqLabel = (f: string | null | undefined) => {
  const v = String(f || "").toLowerCase();
  if (v === "daily" || v === "1") return "Daily";
  if (v === "weekly" || v === "2") return "Weekly";
  if (v === "monthly" || v === "3") return "Monthly";
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : "—";
};

const toneClasses: Record<string, string> = {
  success: "border-success/40 bg-success/5",
  warning: "border-amber-500/40 bg-amber-500/10",
  destructive: "border-destructive/40 bg-destructive/10",
  muted: "border-border bg-muted/40",
};

const badgeVariant: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  success: "success",
  warning: "secondary",
  destructive: "destructive",
  muted: "outline",
};

/**
 * Compact, embeddable summary of a single e-mandate so customers can see the
 * setup, amount, dates and bank status inside the product it belongs to.
 */
export function MandateStatusCard({
  mandate,
  compact = false,
  className = "",
}: {
  mandate: MandateRow | null;
  compact?: boolean;
  className?: string;
}) {
  if (!mandate) return null;
  const meta = mandateStatusMeta(mandate.status);
  // VFD expires an unfunded mandate 7 days after creation.
  const daysLeft = mandate.status === "pending" && mandate.expires_at
    ? Math.ceil((new Date(mandate.expires_at).getTime() - Date.now()) / 86400000)
    : null;
  const Icon = meta.tone === "success" ? ShieldCheck : meta.tone === "warning" ? Clock : AlertTriangle;

  return (
    <div className={`p-3 rounded-xl border ${toneClasses[meta.tone]} space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 flex-none text-muted-foreground" />
          <span className="text-xs font-semibold truncate">E-Mandate</span>
        </div>
        <Badge variant={badgeVariant[meta.tone]} className="text-[10px]">{meta.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex justify-between col-span-2">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-medium">{fmtMoney(mandate.amount)} / {freqLabel(mandate.frequency).toLowerCase()}</span>
        </div>
        <div className="flex justify-between col-span-2">
          <span className="text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Start</span>
          <span className="font-medium">{fmtDate(mandate.start_date)}</span>
        </div>
        <div className="flex justify-between col-span-2">
          <span className="text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> End</span>
          <span className="font-medium">{fmtDate(mandate.end_date)}</span>
        </div>
        {!compact && (
          <>
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Setup fee</span>
              <span className="font-medium">
                {fmtMoney(mandate.setup_fee)}
                {mandate.setup_fee ? (
                  <span className="text-muted-foreground font-normal">
                    {" "}({fmtMoney(mandate.setup_fee_internal_share)} management + {fmtMoney(mandate.setup_fee_nibss_share)} NIBSS)
                  </span>
                ) : null}
              </span>
            </div>
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Payer account</span>
              <span className="font-mono">{mandate.payer_account_number || "—"}</span>
            </div>
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono truncate max-w-[55%] text-right">{mandate.mandate_reference || "—"}</span>
            </div>
          </>
        )}
      </div>

      {daysLeft !== null && daysLeft > 0 && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
          <Timer className="h-3 w-3 text-amber-600 mt-0.5 flex-none" />
          <p className="text-[10px] leading-snug">
            <span className="font-semibold">{daysLeft} day{daysLeft === 1 ? "" : "s"} left</span> to complete
            your ₦50 verification payment, or your bank expires this mandate (setup fee auto-refunded).
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        {mandate.rejection_reason ? mandate.rejection_reason : meta.hint}
      </p>
    </div>
  );
}
