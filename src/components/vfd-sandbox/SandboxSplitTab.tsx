import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { Receipt, Plus, RefreshCw, CreditCard } from "lucide-react";

interface Split {
  id: string; title: string; total_amount: number; split_count: number;
  per_person_amount: number; paid_count: number; status: string;
  merchant_name: string | null; creator_id: string;
  vfd_sandbox_split_participants?: { user_id: string; status: string }[];
}

export function SandboxSplitTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const [splits, setSplits] = useState<Split[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", total_amount: "", split_count: "2", merchant_name: "" });

  const loadSplits = async () => {
    const result = await products.listSplits();
    if (result?.data) setSplits(result.data);
  };

  useEffect(() => { loadSplits(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    const result = await products.createSplit({
      title: form.title,
      total_amount: Number(form.total_amount),
      split_count: Number(form.split_count),
      merchant_name: form.merchant_name || null,
    });
    if (result?.data) {
      toast({ title: "Split Created!" });
      setForm({ title: "", total_amount: "", split_count: "2", merchant_name: "" });
      setShowCreate(false);
      await loadSplits();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" /> SplitPay
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadSplits}><RefreshCw className="h-3 w-3" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="h-3 w-3 mr-1" /> New Split</Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Bill Split</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Dinner at Iya Basira" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Total (₦)</Label>
                <Input type="number" value={form.total_amount} onChange={(e) => setForm(p => ({ ...p, total_amount: e.target.value }))} placeholder="10000" />
              </div>
              <div>
                <Label>Split Between</Label>
                <Select value={form.split_count} onValueChange={(v) => setForm(p => ({ ...p, split_count: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6].map(n => <SelectItem key={n} value={n.toString()}>{n} people</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.total_amount && form.split_count && (
              <p className="text-xs text-muted-foreground">
                Each person pays: ₦{Math.ceil(Number(form.total_amount) / Number(form.split_count)).toLocaleString()}
              </p>
            )}
            <div>
              <Label>Merchant (optional)</Label>
              <Input value={form.merchant_name} onChange={(e) => setForm(p => ({ ...p, merchant_name: e.target.value }))} placeholder="Restaurant name" />
            </div>
            <Button onClick={handleCreate} disabled={products.loading || !form.title || !form.total_amount} className="w-full">
              Create Split
            </Button>
          </CardContent>
        </Card>
      )}

      {splits.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No splits yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {splits.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      ₦{Number(s.total_amount).toLocaleString()} • {s.paid_count}/{s.split_count} paid
                      {s.merchant_name && ` • ${s.merchant_name}`}
                    </p>
                  </div>
                  <Badge variant="outline" className={
                    s.status === "active" ? "text-amber-600 border-amber-500" :
                    s.status === "completed" ? "text-green-600 border-green-500" : "text-muted-foreground"
                  }>
                    {s.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Your share:</span>
                  <span className="font-semibold">₦{Number(s.per_person_amount).toLocaleString()}</span>
                </div>
                {s.status === "active" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={async () => {
                      await products.joinSplit(s.id);
                      toast({ title: "Joined split!" });
                      loadSplits();
                    }} disabled={products.loading}>
                      Join
                    </Button>
                    <Button size="sm" onClick={async () => {
                      const result = await products.paySplit(s.id);
                      if (result?.data) {
                        toast({ title: "Paid!", description: `₦${Number(s.per_person_amount).toLocaleString()}` });
                        loadSplits();
                      }
                    }} disabled={products.loading}>
                      <CreditCard className="h-3 w-3 mr-1" /> Pay ₦{Number(s.per_person_amount).toLocaleString()}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
