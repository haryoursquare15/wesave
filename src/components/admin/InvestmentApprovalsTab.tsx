import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useVestaraLedger } from "@/hooks/useVestaraLedger";
import { CheckCircle2, XCircle, Clock, RefreshCw, Loader2, AlertTriangle, Landmark } from "lucide-react";

interface PendingSavings {
  id: string;
  user_id: string;
  product_code: string;
  principal: number;
  tenor_days: number;
  user_rate: number;
  vfd_rate: number;
  approval_submitted_at: string;
  subaccount_funded_at: string | null;
  sub_account_nuban: string | null;
  sub_account_transfer_ref: string | null;
  sub_account_transferred_at: string | null;
  sub_account_reversed_at: string | null;
  vestara_products?: { code: string; name: string; is_upfront_yield: boolean; sub_account_nuban: string | null } | null;
  profiles?: { full_name: string | null; email: string | null } | null;
}

interface AgingSummary {
  threshold_hours: number;
  count: number;
  total_principal: number;
}

const AGING_THRESHOLD_HOURS = 48;

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export function InvestmentApprovalsTab() {
  const { invoke } = useVestaraLedger();
  const { toast } = useToast();
  const [items, setItems] = useState<PendingSavings[]>([]);
  const [aging, setAging] = useState<AgingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmRef, setConfirmRef] = useState<Record<string, string>>({});
  const [confirmNote, setConfirmNote] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<Record<string, "approve" | "reject" | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await invoke("list_pending_savings_admin", { aging_threshold_hours: AGING_THRESHOLD_HOURS });
    if (res?.pending) setItems(res.pending as PendingSavings[]);
    if (res?.aging) setAging(res.aging as AgingSummary);
    setLoading(false);
  }, [invoke]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: "approve" | "reject") => {
    setActing(a => ({ ...a, [id]: action }));
    const fn = action === "approve" ? "approve_savings" : "reject_savings";
    const payload = action === "approve"
      ? {
          savings_id: id,
          notes: notes[id] || null,
          vfd_confirmation_reference: (confirmRef[id] || "").trim(),
          vfd_confirmation_note: confirmNote[id] || null,
        }
      : { savings_id: id, notes: notes[id] || null };
    const res = await invoke(fn, payload);
    setActing(a => ({ ...a, [id]: null }));
    if (res?.success) {
      const reversal = (res as { reversal?: { reference?: string } })?.reversal;
      toast({
        title: action === "approve" ? "Placement confirmed — investment active" : "Investment rejected",
        description: action === "approve"
          ? "Interest now starts accruing and the maturity date runs from today."
          : reversal?.reference
            ? `Funds were reversed out of the product sub-account (ref ${reversal.reference}) and refunded to the customer's wallet.`
            : `Funds were refunded to the customer's wallet${res.refunded ? ` (₦${Number(res.refunded).toLocaleString()})` : ""}.`,
      });
      await load();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-warning" />
          Investment Approvals
          <Badge variant="outline" className="ml-2">{items.length} pending</Badge>
        </CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {aging && aging.count > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-destructive">
                {aging.count} placement{aging.count === 1 ? "" : "s"} unactioned for over {aging.threshold_hours}h
              </p>
              <p className="text-xs text-muted-foreground">
                ₦{Number(aging.total_principal).toLocaleString()} of customer money is already sitting in product
                sub-accounts at VFD awaiting a placement instruction or confirmation.
              </p>
            </div>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No investments awaiting review. New customer savings will appear here.
          </div>
        ) : (
          items.map(s => {
            const funded = s.subaccount_funded_at ?? s.sub_account_transferred_at;
            const agingHours = hoursSince(funded);
            const isStale = agingHours !== null && agingHours > AGING_THRESHOLD_HOURS;
            const refValue = (confirmRef[s.id] || "").trim();
            const canApprove = refValue.length > 0 && !acting[s.id];
            return (
              <div key={s.id} className={`border rounded-xl p-4 space-y-3 ${isStale ? "border-destructive/40" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {s.vestara_products?.name || s.product_code}
                      {s.vestara_products?.is_upfront_yield && (
                        <Badge variant="outline" className="ml-2 text-[10px]">Upfront yield</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.profiles?.full_name || "Unknown"} · {s.profiles?.email || s.user_id.slice(0, 8)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Submitted {new Date(s.approval_submitted_at).toLocaleString("en-NG")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">₦{Number(s.principal).toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.tenor_days}d · user {Number(s.user_rate).toFixed(2)}% / vfd {Number(s.vfd_rate).toFixed(2)}%
                    </p>
                  </div>
                </div>

                <div className="rounded-md bg-muted/40 px-2 py-2 space-y-1">
                  <p className="text-[11px] flex items-center gap-1.5">
                    <Landmark className="h-3 w-3 shrink-0" />
                    {funded ? (
                      <span>
                        Funds landed in sub-account{" "}
                        <span className="font-mono">{s.sub_account_nuban || s.vestara_products?.sub_account_nuban || "—"}</span>{" "}
                        on {new Date(funded).toLocaleString("en-NG")}
                        {agingHours !== null && (
                          <span className={isStale ? "text-destructive font-medium" : "text-muted-foreground"}>
                            {" "}({agingHours.toFixed(0)}h ago)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-destructive">
                        Real funds have NOT reached the product sub-account yet — do not approve.
                      </span>
                    )}
                  </p>
                  {s.sub_account_transfer_ref && (
                    <p className="text-[11px] text-muted-foreground">
                      Funding transfer ref: <span className="font-mono">{s.sub_account_transfer_ref}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`ref-${s.id}`} className="text-xs">
                    VFD placement confirmation reference <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`ref-${s.id}`}
                    placeholder="e.g. VFD email/ticket ref confirming the deposit was placed"
                    value={confirmRef[s.id] || ""}
                    onChange={e => setConfirmRef(r => ({ ...r, [s.id]: e.target.value }))}
                    className="text-sm"
                  />
                  <Input
                    placeholder="Optional confirmation note (who at VFD confirmed, date, etc.)"
                    value={confirmNote[s.id] || ""}
                    onChange={e => setConfirmNote(r => ({ ...r, [s.id]: e.target.value }))}
                    className="text-sm"
                  />
                </div>

                <Textarea
                  placeholder="Optional note for the customer (shown if rejecting)"
                  value={notes[s.id] || ""}
                  onChange={e => setNotes(n => ({ ...n, [s.id]: e.target.value }))}
                  rows={2}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                    disabled={!canApprove}
                    onClick={() => act(s.id, "approve")}
                  >
                    {acting[s.id] === "approve" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-destructive border-destructive/40 hover:bg-destructive/5"
                    disabled={!!acting[s.id]}
                    onClick={() => act(s.id, "reject")}
                  >
                    {acting[s.id] === "reject" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
                    Reject &amp; Refund
                  </Button>
                </div>
                {!refValue && (
                  <p className="text-[11px] text-muted-foreground">
                    Approval is blocked until VFD's placement confirmation reference is entered.
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
