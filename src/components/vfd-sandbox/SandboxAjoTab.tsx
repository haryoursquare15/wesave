import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import {
  Users, Plus, RefreshCw, ArrowRight, ArrowLeft, Play, Crown,
  ListOrdered, Coins, Calendar, Info, LogOut, AlertCircle, ArrowLeftRight, Share2,
} from "lucide-react";
import { SandboxGroupInviteDialog } from "./SandboxGroupInviteDialog";

interface Group {
  id: string; name: string; contribution_amount: number; period: string;
  max_members: number; member_count: number; current_cycle: number;
  total_cycles: number; status: string; admin_id: string;
  auto_debit?: boolean;
  contribution_hour?: number; contribution_minute?: number;
  contribution_day_of_week?: number; contribution_day_of_month?: number;
  commenced_at?: string;
  vfd_sandbox_group_members?: { user_id: string; payout_position?: number; has_contributed_current?: boolean; has_received_payout?: boolean }[];
}

const daysOfWeek = [
  { value: 0, label: "Sunday" }, { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" }, { value: 4, label: "Thursday" }, { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const timeSlots = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const amPm = hour < 12 ? "AM" : "PM";
  return { value: i, hour, minute, label: `${displayHour}:${minute === 0 ? "00" : "30"} ${amPm}` };
});

const daysOfMonth = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1, label: `${i + 1}${["st", "nd", "rd"][i] || "th"}`,
}));

function calculatePlatformFee(pool: number) {
  if (pool < 20000) return 100;
  return Math.min(pool * 0.01, 500);
}

const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

export function SandboxAjoTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detailGroup, setDetailGroup] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const [form, setForm] = useState({
    name: "",
    maxMembers: 5,
    contributionAmount: 10000,
    period: "weekly" as string,
    autoDebit: true,
    timeSlot: 18,
    dayOfWeek: 1,
    dayOfMonth: 1,
  });

  const loadGroups = async () => {
    const result = await products.listGroups();
    if (result?.data) setGroups(result.data);
  };

  useEffect(() => { loadGroups(); }, []); // eslint-disable-line

  const pool = form.contributionAmount * form.maxMembers;
  const fee = calculatePlatformFee(pool);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    const slot = timeSlots[form.timeSlot];
    const result = await products.createGroup({
      name: form.name,
      contribution_amount: form.contributionAmount,
      max_members: form.maxMembers,
      period: form.period,
      auto_debit: form.autoDebit,
      contribution_hour: slot?.hour ?? 9,
      contribution_minute: slot?.minute ?? 0,
      contribution_day_of_week: form.dayOfWeek,
      contribution_day_of_month: form.dayOfMonth,
    });
    if (result?.data) {
      toast({ title: "Group Created!", description: form.name });
      setForm({ name: "", maxMembers: 5, contributionAmount: 10000, period: "weekly", autoDebit: true, timeSlot: 18, dayOfWeek: 1, dayOfMonth: 1 });
      setShowCreate(false);
      await loadGroups();
    }
  };

  const loadDetail = async (groupId: string) => {
    const result = await products.getGroupDetail(groupId);
    if (result?.data) {
      setDetailData(result.data);
      setDetailGroup(groupId);
    }
  };

  // Detail view
  if (detailGroup && detailData) {
    const g = detailData.group || detailData;
    const members = detailData.members || g.vfd_sandbox_group_members || [];
    const payoutOrder = detailData.payout_order || [];
    const isAdmin = true; // sandbox user is always creator
    const progress = g.total_cycles > 0 ? ((g.current_cycle - 1) / g.total_cycles) * 100 : 0;

    return (
      <div className="space-y-4">
        <button onClick={() => { setDetailGroup(null); setDetailData(null); }} className="text-sm text-primary flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to Groups
        </button>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">{g.name}</h3>
                <p className="text-xs text-muted-foreground">
                  ₦{fmt(Number(g.contribution_amount))} / {g.period} • {g.member_count}/{g.max_members} members
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={g.status === "active" ? "text-green-600 border-green-500" : g.status === "completed" ? "text-primary border-primary" : "text-muted-foreground"}>
                  {g.status}
                </Badge>
                {g.status === "pending" && g.member_count < g.max_members && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowInviteDialog(true)}>
                    <Share2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {g.status === "active" && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Cycle {g.current_cycle} of {g.total_cycles}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {g.status === "pending" && isAdmin && g.member_count >= g.max_members && (
                <Button size="sm" onClick={async () => {
                  const r = await products.commenceGroup(g.id);
                  if (r?.data) { toast({ title: "Thrift commenced! Payout order randomized." }); loadDetail(g.id); }
                }} disabled={products.loading}>
                  <Play className="h-3 w-3 mr-1" /> Commence
                </Button>
              )}
              {g.status === "active" && (
                <Button size="sm" onClick={async () => {
                  const r = await products.contributeGroup(g.id);
                  if (r?.data) {
                    toast({ title: "Contributed!", description: `₦${fmt(Number(g.contribution_amount))} for cycle ${g.current_cycle}` });
                    loadDetail(g.id);
                  }
                }} disabled={products.loading}>
                  <ArrowRight className="h-3 w-3 mr-1" /> Contribute ₦{fmt(Number(g.contribution_amount))}
                </Button>
              )}
              {g.status === "completed" && (
                <>
                  <Button size="sm" variant="outline" onClick={async () => {
                    await products.confirmContinue(g.id);
                    toast({ title: "Continuation confirmed" });
                  }} disabled={products.loading}>
                    Continue
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    await products.exitGroup(g.id);
                    toast({ title: "Exited group" });
                    setDetailGroup(null); setDetailData(null); loadGroups();
                  }} disabled={products.loading}>
                    <LogOut className="h-3 w-3 mr-1" /> Exit
                  </Button>
                  {isAdmin && (
                    <Button size="sm" onClick={async () => {
                      await products.restartGroup(g.id, true);
                      toast({ title: "Group restarted!" });
                      loadDetail(g.id);
                    }} disabled={products.loading}>
                      Restart Group
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="members">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="payout"><ListOrdered className="h-3 w-3 mr-1" /> Payout Order</TabsTrigger>
          </TabsList>
          <TabsContent value="members" className="space-y-2 mt-3">
            {members.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">No members yet</p>
            ) : members.map((m: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <span className="font-mono truncate max-w-[160px]">{m.user_id?.slice(0, 8)}...</span>
                  {m.user_id === g.admin_id && <Crown className="h-3 w-3 text-warning" />}
                </div>
                <div className="flex items-center gap-2">
                  {m.has_contributed_current && <Badge variant="secondary" className="text-[10px]">Contributed</Badge>}
                  {m.has_received_payout && <Badge className="text-[10px]">Received</Badge>}
                  {m.payout_position != null && <span className="text-muted-foreground">#{m.payout_position}</span>}
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="payout" className="space-y-2 mt-3">
            {payoutOrder.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">Payout order is assigned when the thrift commences (Fisher-Yates shuffle).</p>
            ) : payoutOrder.map((userId: string, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                <span>Position #{i + 1}</span>
                <span className="font-mono">{userId.slice(0, 8)}...</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>

        {/* Fee info */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground">
            Platform fee per payout: {Number(g.contribution_amount) * Number(g.max_members) < 20000
              ? "₦100 (flat)"
              : `₦${fmt(calculatePlatformFee(Number(g.contribution_amount) * Number(g.max_members)))} (1%, max ₦500)`}
          </p>
        </div>
      </div>
    );
  }

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

      {/* Group limit notice */}
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
          <p className="text-xs text-muted-foreground">
            You can be a member of up to 2 active groups at a time. Contribution: ₦5,000 – ₦500,000. Members: 3 – 20.
          </p>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Thrift Group</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Group Name</Label>
              <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Family Savings Circle" className="h-12" />
            </div>

            {/* Max Members Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Maximum Members</Label>
                <span className="text-lg font-semibold text-primary">{form.maxMembers}</span>
              </div>
              <Slider value={[form.maxMembers]} onValueChange={([v]) => setForm(p => ({ ...p, maxMembers: v }))} min={3} max={20} step={1} className="py-2" />
              <div className="flex justify-between text-xs text-muted-foreground"><span>3</span><span>20</span></div>
            </div>

            {/* Contribution Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Contribution Amount</Label>
                <span className="text-lg font-semibold text-primary">₦{fmt(form.contributionAmount)}</span>
              </div>
              <Slider value={[form.contributionAmount]} onValueChange={([v]) => setForm(p => ({ ...p, contributionAmount: v }))} min={5000} max={500000} step={5000} className="py-2" />
              <div className="flex justify-between text-xs text-muted-foreground"><span>₦5,000</span><span>₦500,000</span></div>
            </div>

            {/* Period */}
            <div>
              <Label>Contribution Period</Label>
              <Select value={form.period} onValueChange={(v) => setForm(p => ({ ...p, period: v }))}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Auto-Debit */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Coins className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Enable Auto-Debit</p>
                  <p className="text-[10px] text-muted-foreground">Auto-collect on schedule</p>
                </div>
              </div>
              <Switch checked={form.autoDebit} onCheckedChange={(v) => setForm(p => ({ ...p, autoDebit: v }))} />
            </div>

            {/* Schedule */}
            {form.autoDebit && (
              <div className="space-y-3 p-3 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Auto-Contribution Schedule</span>
                </div>

                {form.period === "weekly" && (
                  <div>
                    <Label>Day of Week</Label>
                    <Select value={String(form.dayOfWeek)} onValueChange={(v) => setForm(p => ({ ...p, dayOfWeek: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {daysOfWeek.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {form.period === "monthly" && (
                  <div>
                    <Label>Day of Month</Label>
                    <Select value={String(form.dayOfMonth)} onValueChange={(v) => setForm(p => ({ ...p, dayOfMonth: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {daysOfMonth.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Contribution Time</Label>
                  <Select value={String(form.timeSlot)} onValueChange={(v) => setForm(p => ({ ...p, timeSlot: Number(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {timeSlots.map(s => <SelectItem key={s.value} value={String(s.value)}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="p-3 rounded-xl bg-muted/50 space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2"><Info className="h-3 w-3" /> Group Summary</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Pool per Cycle</span>
                  <span className="font-medium">₦{fmt(pool)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Payout</span>
                  <span className="font-medium">₦{fmt(pool - fee)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Platform Fee</span>
                  <span className="text-muted-foreground">
                    {pool < 20000 ? "₦100 (flat)" : `₦${fmt(fee)} (1%, max ₦500)`}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              By creating this group, you agree to our Terms. Platform fee: ₦100 flat under ₦20,000 or 1% (max ₦500) for ₦20,000+.
            </p>

            <Button onClick={handleCreate} disabled={products.loading || !form.name} className="w-full h-12">
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
            return (
              <Card key={g.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => loadDetail(g.id)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ₦{fmt(Number(g.contribution_amount))} / {g.period} • {g.member_count}/{g.max_members} members
                      </p>
                    </div>
                    <Badge variant="outline" className={g.status === "active" ? "text-green-600 border-green-500" : g.status === "completed" ? "text-primary border-primary" : "text-muted-foreground"}>
                      {g.status}
                    </Badge>
                  </div>

                  {g.total_cycles > 0 && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Cycle {g.current_cycle} of {g.total_cycles}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {g.status === "active" && g.member_count < g.max_members && (
                      <Button size="sm" variant="outline" onClick={async (e) => {
                        e.stopPropagation();
                        await products.joinGroup(g.id);
                        toast({ title: "Joined group!" });
                        loadGroups();
                      }} disabled={products.loading}>
                        Join
                      </Button>
                    )}
                    {g.status === "active" && (
                      <Button size="sm" onClick={async (e) => {
                        e.stopPropagation();
                        const result = await products.contributeGroup(g.id);
                        if (result?.data) {
                          toast({ title: "Contributed!", description: `₦${fmt(Number(g.contribution_amount))} for cycle ${g.current_cycle}` });
                          loadGroups();
                        }
                      }} disabled={products.loading}>
                        <ArrowRight className="h-3 w-3 mr-1" /> Contribute
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
