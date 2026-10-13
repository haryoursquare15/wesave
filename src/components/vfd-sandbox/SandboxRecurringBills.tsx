import { invokeWithGatewayRetry } from "@/lib/productsRetry";
import { useEffect, useState, useCallback } from "react";
import { Repeat, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";

interface Recurring {
  id: string;
  nickname: string | null;
  biller_name: string;
  customer_id: string;
  amount: number;
  frequency: string;
  status: string;
  next_run_at: string;
  last_run_status: string | null;
  last_run_reason: string | null;
}

export function SandboxRecurringBills() {
  const { client } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);

  const call = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    const { data: s } = await client.auth.getSession();
    const token = s?.session?.access_token;
    if (!token) return null;
    const resp = await invokeWithGatewayRetry(action, body, () => client.functions.invoke("vfd-sandbox-products", {
      body: { action, ...body }, headers: { Authorization: `Bearer ${token}` },
    }));
    return resp.data;
  }, [client]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await call("list_recurring_bills");
    setRows(r?.data || []);
    setLoading(false);
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (r: Recurring) => {
    await call("update_recurring_bill", { id: r.id, status: r.status === "active" ? "paused" : "active" });
    toast({ title: r.status === "active" ? "Paused" : "Resumed" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Cancel this recurring bill?")) return;
    await call("delete_recurring_bill", { id });
    toast({ title: "Cancelled" });
    load();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (rows.length === 0) return (
    <div className="text-center py-12">
      <Repeat className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">No recurring bills. Set one up after paying a bill — funds auto-deduct from your wallet at 4 PM WAT.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.id} className="bg-card rounded-xl border border-border/50 p-3.5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Repeat className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground truncate">{r.nickname || r.biller_name}</p>
                <Badge variant={r.status === "active" ? "default" : "secondary"} className="text-[9px] h-4 px-1.5 capitalize">{r.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{r.biller_name} • {r.customer_id}</p>
              <p className="text-[10px] text-muted-foreground mt-1 capitalize">
                ₦{Number(r.amount).toLocaleString()} • {r.frequency} • Next: {new Date(r.next_run_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })} 4PM WAT
              </p>
              {r.last_run_status && r.last_run_status !== "paid" && (
                <p className="text-[10px] text-warning mt-1">Last run: {r.last_run_reason || r.last_run_status}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle(r)}>
                {r.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(r.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
