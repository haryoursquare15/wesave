import { useEffect, useState, useCallback } from "react";
import { Receipt, Loader2, Clock } from "lucide-react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { Badge } from "@/components/ui/badge";
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
}

export function SandboxBillReceipts() {
  const { client } = useSandboxAwareAuth();
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: s } = await client.auth.getSession();
      const token = s?.session?.access_token;
      if (!token) return;
      const resp = await client.functions.invoke("vfd-sandbox-products", {
        body: { action: "list_bill_receipts", limit: 100 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRows(resp.data?.data || []);
    } finally { setLoading(false); }
  }, [client]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (rows.length === 0) return (
    <div className="text-center py-12">
      <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">No receipts yet. Pay a bill to see history here.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {rows.map(r => {
        const expiringSoon = r.expires_at && new Date(r.expires_at).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;
        return (
          <div key={r.id} className="bg-card rounded-xl border border-border/50 p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{r.biller_name}</p>
              <p className="text-xs text-muted-foreground truncate">{r.customer_id} • {formatDistanceToNow(new Date(r.paid_at), { addSuffix: true })}</p>
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
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-foreground">₦{Number(r.amount).toLocaleString()}</p>
              <p className="text-[10px] text-success">Successful</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
