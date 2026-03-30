import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { Users, Plus, RefreshCw, ArrowRight } from "lucide-react";

interface Group {
  id: string; name: string; contribution_amount: number; period: string;
  max_members: number; member_count: number; current_cycle: number;
  total_cycles: number; status: string; admin_id: string;
  vfd_sandbox_group_members?: { user_id: string }[];
}

export function SandboxAjoTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", contribution_amount: "", max_members: "5", period: "monthly" });

  const loadGroups = async () => {
    const result = await products.listGroups();
    if (result?.data) setGroups(result.data);
  };

  useEffect(() => { loadGroups(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    const result = await products.createGroup({
      name: form.name,
      contribution_amount: Number(form.contribution_amount),
      max_members: Number(form.max_members),
      period: form.period,
    });
    if (result?.data) {
      toast({ title: "Group Created!", description: form.name });
      setForm({ name: "", contribution_amount: "", max_members: "5", period: "monthly" });
      setShowCreate(false);
      await loadGroups();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Thrift Groups (Ajo)
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadGroups}><RefreshCw className="h-3 w-3" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3 w-3 mr-1" /> New Group
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Thrift Group</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Group Name</Label>
              <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Office Savings" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contribution (₦)</Label>
                <Input type="number" value={form.contribution_amount} onChange={(e) => setForm(p => ({ ...p, contribution_amount: e.target.value }))} placeholder="5000" />
              </div>
              <div>
                <Label>Members</Label>
                <Select value={form.max_members} onValueChange={(v) => setForm(p => ({ ...p, max_members: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[3, 5, 7, 10].map(n => <SelectItem key={n} value={n.toString()}>{n} members</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Period</Label>
              <Select value={form.period} onValueChange={(v) => setForm(p => ({ ...p, period: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={products.loading || !form.name || !form.contribution_amount} className="w-full">
              {products.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Group
            </Button>
          </CardContent>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No thrift groups yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const progress = g.total_cycles > 0 ? ((g.current_cycle - 1) / g.total_cycles) * 100 : 0;
            const isMember = g.vfd_sandbox_group_members?.some(m => true); // sandbox: show all
            return (
              <Card key={g.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ₦{Number(g.contribution_amount).toLocaleString()} / {g.period} • {g.member_count}/{g.max_members} members
                      </p>
                    </div>
                    <Badge variant="outline" className={g.status === "active" ? "text-green-600 border-green-500" : "text-muted-foreground"}>
                      {g.status}
                    </Badge>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Cycle {g.current_cycle} of {g.total_cycles}</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  <div className="flex gap-2">
                    {g.status === "active" && g.member_count < g.max_members && (
                      <Button size="sm" variant="outline" onClick={async () => {
                        await products.joinGroup(g.id);
                        toast({ title: "Joined group!" });
                        loadGroups();
                      }} disabled={products.loading}>
                        Join
                      </Button>
                    )}
                    {g.status === "active" && (
                      <Button size="sm" onClick={async () => {
                        const result = await products.contributeGroup(g.id);
                        if (result?.data) {
                          toast({ title: "Contributed!", description: `₦${Number(g.contribution_amount).toLocaleString()} for cycle ${g.current_cycle}` });
                          loadGroups();
                        }
                      }} disabled={products.loading}>
                        <ArrowRight className="h-3 w-3 mr-1" /> Contribute ₦{Number(g.contribution_amount).toLocaleString()}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
