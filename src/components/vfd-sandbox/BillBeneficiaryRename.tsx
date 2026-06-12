import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";

interface Props {
  category: string;
  biller: { id: string; name: string; division: string; product: string } | null;
  item: { paymentCode: string; paymentitemname: string } | null;
  customerId: string;
  phoneNumber: string;
  onRenamed?: () => void;
}

export function BillBeneficiaryRename({ category, biller, item, customerId, phoneNumber, onRenamed }: Props) {
  const { client } = useSandboxAwareAuth();
  const { toast } = useToast();
  const defaultName = biller ? `${biller.name} • ${customerId.slice(-4)}` : "";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);

  if (!biller || !customerId) return null;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data: s } = await client.auth.getSession();
      const token = s?.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const r = await client.functions.invoke("vfd-sandbox-products", {
        body: {
          action: "save_bill_beneficiary",
          nickname: name.trim(),
          category,
          biller_id: biller.id,
          biller_name: biller.name,
          division: biller.division,
          product_id: biller.product,
          payment_item_code: item?.paymentCode,
          payment_item_name: item?.paymentitemname,
          customer_id: customerId,
          phone_number: phoneNumber || undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.data?.error) throw new Error(r.data.error);
      setEditing(false);
      onRenamed?.();
    } catch (e) {
      toast({ title: "Couldn't rename", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      {editing ? (
        <>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nickname e.g. My DStv"
            className="h-8 text-xs max-w-[200px]"
            autoFocus
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-success" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(false); setName(defaultName); }} disabled={saving}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Saved as <span className="font-medium text-foreground">{defaultName}</span> · Rename
        </button>
      )}
    </div>
  );
}
