import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useMandates, PRODUCT_LABEL, type MandateRow } from "@/hooks/useMandates";
import { MandateStatusCard } from "./MandateStatusCard";

const ACTIVE = new Set(["bank_approved", "authorized"]);

/**
 * "My E-Mandates" — one place where customers can see every direct-debit
 * authorization they've set up: product, amount, start/end dates and the live
 * bank status. The same data is surfaced inline inside each product.
 */
export function SandboxMandatesTab() {
  const { mandates, loading, refresh } = useMandates();

  const { active, other } = useMemo(() => {
    const a: MandateRow[] = [];
    const o: MandateRow[] = [];
    for (const m of mandates) (ACTIVE.has(m.status) ? a : o).push(m);
    return { active: a, other: o };
  }, [mandates]);

  const section = (title: string, rows: MandateRow[]) =>
    rows.length > 0 && (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
        {rows.map((m) => (
          <div key={m.id} className="space-y-1">
            <p className="text-xs font-medium">
              {PRODUCT_LABEL[m.product_type] || m.product_type}
            </p>
            <MandateStatusCard mandate={m} />
          </div>
        ))}
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> My E-Mandates
          </h2>
          <p className="text-xs text-muted-foreground">
            Direct-debit authorizations across your savings and Ajo products.
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && mandates.length === 0 && (
        <p className="text-xs text-muted-foreground">Loading your mandates…</p>
      )}

      {!loading && mandates.length === 0 && (
        <div className="p-4 rounded-xl border border-dashed text-center space-y-1">
          <p className="text-sm font-medium">No mandates yet</p>
          <p className="text-xs text-muted-foreground">
            When you set up auto-contributions for Goal Savings, Target Ajo or a thrift group, the mandate appears here.
          </p>
        </div>
      )}

      {section("Active", active)}
      {section("Pending & past", other)}
    </div>
  );
}
