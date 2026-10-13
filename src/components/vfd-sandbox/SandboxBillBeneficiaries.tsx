import { invokeWithGatewayRetry } from "@/lib/productsRetry";
import { useEffect, useState, useCallback } from "react";
import { Trash2, Loader2, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";

interface Beneficiary {
  id: string;
  nickname: string;
  category: string;
  biller_name: string;
  customer_id: string;
  phone_number: string | null;
}

export function SandboxBillBeneficiaries() {
  const { client } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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
    const r = await call("list_bill_beneficiaries");
    setRows(r?.data || []);
    setLoading(false);
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Delete this beneficiary?")) return;
    await call("delete_bill_beneficiary", { id });
    toast({ title: "Removed" });
    load();
  };

  const saveRename = async (b: Beneficiary) => {
    await call("save_bill_beneficiary", {
      nickname: editName, category: b.category, biller_id: (b as any).biller_id,
      biller_name: b.biller_name, division: (b as any).division, product_id: (b as any).product_id,
      payment_item_code: (b as any).payment_item_code, payment_item_name: (b as any).payment_item_name,
      customer_id: b.customer_id, phone_number: b.phone_number,
    });
    setEditing(null);
    load();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (rows.length === 0) return (
    <div className="text-center py-12">
      <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">No saved beneficiaries. Pay a bill — we'll save the number for next time.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {rows.map(b => (
        <div key={b.id} className="bg-card rounded-xl border border-border/50 p-3.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {editing === b.id ? (
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" />
            ) : (
              <p className="text-sm font-semibold text-foreground truncate">{b.nickname}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">{b.biller_name} • {b.customer_id}</p>
          </div>
          {editing === b.id ? (
            <Button size="sm" onClick={() => saveRename(b)} className="h-8">Save</Button>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(b.id); setEditName(b.nickname); }}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(b.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
