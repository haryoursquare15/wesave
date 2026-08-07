import { useEffect, useState, useCallback } from "react";
import { Receipt, Loader2, Clock, RefreshCw } from "lucide-react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface ReceiptRow {
  id: string;
  reference: string;
  category: string;
  biller_name: string;
  payment_item_name: string | null;
  customer_id: string;
  amount: number;
  paid_at: string;
  expires_at: string | null;
  status: string | null;
  delivery_type: string | null;
  delivery_token: string | null;
  delivery_status: string | null;
  delivery_detail: Record<string, unknown> | null;
}

export function SandboxBillReceipts() {
  const { client } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const call = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    const { data: s } = await client.auth.getSession();
    const token = s?.session?.access_token;
    if (!token) return null;
    const resp = await client.functions.invoke("vfd-sandbox-products", {
      body: { action, ...body },
      headers: { Authorization: `Bearer ${token}` },
    });
    return resp.data;
  }, [client]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await call("list_bill_receipts", { limit: 100 });
      setRows(d?.data || []);
    } finally { setLoading(false); }
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const pendingCount = rows.filter(r => r.status === "pending" || r.delivery_status === "pending").length;

  const checkPending = async () => {
    setChecking(true);
    try {
      const d = await call("reconcile_pending_bills", { limit: 25 });
      const res = d?.data;
      if (res) {
        toast({
          title: "Status check complete",
          description: `${res.delivered} delivered · ${res.refunded} refunded · ${res.still_pending} still awaiting the biller.`,
        });
      }
      await load();
    } finally { setChecking(false); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (rows.length === 0) return (
    <div className="text-center py-12">
      <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">No receipts yet. Pay a bill to see history here.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {pendingCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            {pendingCount} payment{pendingCount > 1 ? "s" : ""} awaiting biller confirmation.
          </p>
          <Button size="sm" variant="outline" className="h-8" onClick={checkPending} disabled={checking}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checking ? "animate-spin" : ""}`} />
            Check status
          </Button>
        </div>
      )}
      {rows.map(r => {
        const expiringSoon = r.expires_at && new Date(r.expires_at).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;
        const isPending = r.status === "pending" || r.delivery_status === "pending";
        const isFailed = r.status === "failed" || r.delivery_status === "failed";
        const instruction = (r.delivery_detail as { instruction?: string } | null)?.instruction;
        return (
          <div key={r.id} className="bg-card rounded-xl border border-border/50 p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{r.biller_name}</p>
              <p className="text-xs text-muted-foreground truncate">{r.customer_id} • {formatDistanceToNow(new Date(r.paid_at), { addSuffix: true })}</p>
              {r.delivery_token && (
                <p className="sm:hidden text-[11px] font-mono font-semibold text-primary truncate">
                  {r.delivery_type === "pin" ? "PIN" : "Token"}: {r.delivery_token}
                </p>
              )}
              {(isPending || isFailed) && instruction && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{instruction}</p>
              )}
              {r.expires_at && (
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className={`text-[10px] ${expiringSoon ? "text-warning font-semibold" : "text-muted-foreground"}`}>
                    Expires {formatDistanceToNow(new Date(r.expires_at), { addSuffix: true })}
                  </span>
                  {expiringSoon && <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Renew</Badge>}
                </div>
              )}
            </div>
            {r.delivery_token && (
              <div className="hidden sm:block text-right shrink-0 mr-2">
                <p className="text-[10px] text-muted-foreground">
                  {r.delivery_type === "pin" ? "PIN" : "Token"}
                </p>
                <p className="text-xs font-mono font-semibold text-foreground">{r.delivery_token}</p>
              </div>
            )}
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-foreground">₦{Number(r.amount).toLocaleString()}</p>
              <p className={`text-[10px] ${isFailed ? "text-destructive" : isPending ? "text-warning" : "text-success"}`}>
                {isFailed ? "Failed · refunded" : isPending ? "Awaiting biller" : "Delivered"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
