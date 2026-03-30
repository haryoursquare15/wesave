import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { Target, Plus, RefreshCw, ArrowRight } from "lucide-react";

interface TargetGroup {
  id: string; name: string; goal_amount: number; contribution_amount: number;
  frequency: string; max_members: number; member_count: number;
  total_contributed: number; savings_type: string; status: string;
  target_date: string | null;
}

export function SandboxTargetTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const [targets, setTargets] = useState<TargetGroup[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", goal_amount: "", max_members: "5", frequency: "daily", savings_type: "group" });

  const loadTargets = async () => {
    const result = await products.listTargets();
    if (result?.data) setTargets(result.data);
  };

  useEffect(() => { loadTargets(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    const result = await products.createTarget({
      name: form.name,
      goal_amount: Number(form.goal_amount),
      max_members: Number(form.max_members),
      frequency: form.frequency,
      savings_type: form.savings_type,
    });
    if (result?.data) {
      toast({ title: "Target Created!", description: form.name });
      setForm({ name: "", goal_amount: "", max_members: "5", frequency: "daily", savings_type: "group" });
      setShowCreate(false);
      await loadTargets();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Target Ajo
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadTargets}><RefreshCw className="h-3 w-3" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="h-3 w-3 mr-1" /> New Target</Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Target Savings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Rent Fund" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Goal (₦)</Label>
                <Input type="number" value={form.goal_amount} onChange={(e) => setForm(p => ({ ...p, goal_amount: e.target.value }))} placeholder="100000" />
              </div>
              <div>
                <Label>Members</Label>
                <Select value={form.max_members} onValueChange={(v) => setForm(p => ({ ...p, max_members: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2, 3, 5, 10].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm(p => ({ ...p, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.savings_type} onValueChange={(v) => setForm(p => ({ ...p, savings_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">Group Pot</SelectItem>
                    <SelectItem value="independent">Independent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleCreate} disabled={products.loading || !form.name || !form.goal_amount} className="w-full">
              {products.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Target
            </Button>
          </CardContent>
        </Card>
      )}

      {targets.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No target savings yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {targets.map((t) => {
            const progress = Number(t.goal_amount) > 0 ? (Number(t.total_contributed) / Number(t.goal_amount)) * 100 : 0;
            return (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.frequency} • {t.member_count}/{t.max_members} members • {t.savings_type}
                      </p>
                    </div>
                    <Badge variant="outline" className={t.status === "active" ? "text-green-600 border-green-500" : t.status === "completed" ? "text-primary border-primary" : "text-muted-foreground"}>
                      {t.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>₦{Number(t.total_contributed).toLocaleString()}</span>
                      <span>₦{Number(t.goal_amount).toLocaleString()}</span>
                    </div>
                    <Progress value={Math.min(100, progress)} className="h-2" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Contribution: ₦{Number(t.contribution_amount).toLocaleString()} / {t.frequency}
                    {t.target_date && ` • Target: ${new Date(t.target_date).toLocaleDateString()}`}
                  </p>
                  {t.status === "active" && (
                    <Button size="sm" onClick={async () => {
                      const result = await products.contributeTarget(t.id);
                      if (result?.data) {
                        toast({ title: "Contributed!", description: `₦${Number(t.contribution_amount).toLocaleString()}` });
                        loadTargets();
                      }
                    }} disabled={products.loading}>
                      <ArrowRight className="h-3 w-3 mr-1" /> Contribute ₦{Number(t.contribution_amount).toLocaleString()}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
