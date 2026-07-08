import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useVestaraLedger } from "@/hooks/useVestaraLedger";
import { CheckCircle2, XCircle, Clock, RefreshCw, Loader2 } from "lucide-react";

interface PendingSavings {
  id: string;
  user_id: string;
  product_code: string;
  principal: number;
  tenor_days: number;
  user_rate: number;
  vfd_rate: number;
  approval_submitted_at: string;
  vestara_products?: { code: string; name: string; is_upfront_yield: boolean; sub_account_nuban: string | null } | null;
  profiles?: { full_name: string | null; email: string | null } | null;
}

export function InvestmentApprovalsTab() {
  const { invoke } = useVestaraLedger();
  const { toast } = useToast();
  const [items, setItems] = useState<PendingSavings[]>([]);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<Record<string, "approve" | "reject" | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await invoke("list_pending_savings_admin");
    if (res?.pending) setItems(res.pending as PendingSavings[]);
    setLoading(false);
  }, [invoke]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: "approve" | "reject") => {
    setActing(a => ({ ...a, [id]: action }));
    const fn = action === "approve" ? "approve_savings" : "reject_savings";
    const res = await invoke(fn, { savings_id: id, notes: notes[id] || null });
    setActing(a => ({ ...a, [id]: null }));
    if (res?.success) {
      const subAcct = (res as { sub_account?: { sub_account_nuban?: string; reference?: string } })?.sub_account;
      toast({
        title: action === "approve" ? "Investment approved" : "Investment rejected",
        description: action === "approve"
          ? subAcct?.sub_account_nuban
            ? `Funds routed to product sub-account ${subAcct.sub_account_nuban}${subAcct.reference ? ` (ref ${subAcct.reference})` : ""}.`
            : "Funds have been locked into the savings vault."
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
        {loading && items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No investments awaiting review. New customer savings will appear here.
          </div>
        ) : (
          items.map(s => (
            <div key={s.id} className="border rounded-xl p-4 space-y-3">
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
              {s.vestara_products?.sub_account_nuban && (
                <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1.5">
                  On approval, ₦{Number(s.principal).toLocaleString()} will be routed to product sub-account <span className="font-mono">{s.vestara_products.sub_account_nuban}</span>.
                </p>
              )}
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
                  disabled={!!acting[s.id]}
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
                  Reject & Refund
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
