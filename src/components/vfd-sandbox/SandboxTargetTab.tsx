import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import {
  Target, Plus, RefreshCw, ArrowRight, ArrowLeft, Users, User,
  CalendarDays, AlertTriangle, Wallet, Vote, ArrowDownToLine, UserPlus,
} from "lucide-react";
import { addDays, addWeeks, addMonths, format } from "date-fns";
import { SandboxTargetInviteDialog } from "./SandboxTargetInviteDialog";

interface TargetGroup {
  id: string; name: string; goal_amount: number; contribution_amount: number;
  frequency: string; max_members: number; member_count: number;
  total_contributed: number; savings_type: string; status: string;
  target_date: string | null; description?: string; reason?: string;
}

const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

export function SandboxTargetTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const [targets, setTargets] = useState<TargetGroup[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);

  const [form, setForm] = useState({
    name: "", description: "", reason: "", goal_amount: "",
    max_members: "10", frequency: "monthly", savings_type: "group" as "group" | "independent",
  });

  const targetAmount = parseFloat(form.goal_amount) || 0;
  const maxMembers = parseInt(form.max_members) || 1;
  const contributionAmount = maxMembers > 0 ? Math.ceil(targetAmount / maxMembers) : 0;

  const autoTargetDate = useMemo(() => {
    const members = parseInt(form.max_members) || 1;
    const start = new Date();
    switch (form.frequency) {
      case "daily": return addDays(start, members);
      case "weekly": return addWeeks(start, members);
      case "monthly": return addMonths(start, members);
      default: return addDays(start, members);
    }
  }, [form.frequency, form.max_members]);

  const freqLabel = form.frequency === "daily" ? "days" : form.frequency === "weekly" ? "weeks" : "months";

  const loadTargets = async () => {
    const result = await products.listTargets();
    if (result?.data) setTargets(result.data);
  };

  useEffect(() => { loadTargets(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    if (targetAmount < 1000) { toast({ title: "Target must be at least ₦1,000", variant: "destructive" }); return; }
    const result = await products.createTarget({
      name: form.name, description: form.description, reason: form.reason,
      goal_amount: targetAmount, max_members: maxMembers,
      frequency: form.frequency, savings_type: form.savings_type,
    });
    if (result?.data) {
      toast({ title: "Target Created!", description: form.name });
      setForm({ name: "", description: "", reason: "", goal_amount: "", max_members: "10", frequency: "monthly", savings_type: "group" });
      setShowCreate(false);
      await loadTargets();
    }
  };

  const loadDetail = async (id: string) => {
    const result = await products.getTargetDetail(id);
    if (result?.data) { setDetailData(result.data); setDetailId(id); }
  };

  // Detail View
  if (detailId && detailData) {
    const t = detailData.group || detailData;
    const members = detailData.members || [];
    const contributions = detailData.contributions || [];
    const withdrawalRequests = detailData.withdrawal_requests || [];
    const progress = Number(t.goal_amount) > 0 ? (Number(t.total_contributed) / Number(t.goal_amount)) * 100 : 0;
    const remaining = Math.max(0, Number(t.goal_amount) - Number(t.total_contributed));
    const isIndependent = t.savings_type === "independent";
    const isClosed = t.status === "closed" || t.status === "completed" || t.status === "cancelled";

    return (
      <div className="space-y-4">
        <button onClick={() => { setDetailId(null); setDetailData(null); }} className="text-sm text-primary flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to Targets
        </button>

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
          <Badge variant="outline">{t.frequency}</Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            {isIndependent ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {isIndependent ? "Independent" : "Group Wallet"}
          </Badge>
        </div>

        {t.reason && <p className="text-sm text-muted-foreground">{t.reason}</p>}
        {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}

        {/* Progress */}
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">{isIndependent ? "Aggregate Progress" : "Target Progress"}</span>
            <span className="font-bold text-primary">{progress.toFixed(0)}%</span>
          </div>
          <Progress value={Math.min(progress, 100)} className="h-3 mb-3" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-muted-foreground">Raised</p><p className="text-sm font-bold">₦{fmt(Number(t.total_contributed))}</p></div>
            <div><p className="text-xs text-muted-foreground">Target</p><p className="text-sm font-bold">₦{fmt(Number(t.goal_amount))}</p></div>
            <div><p className="text-xs text-muted-foreground">Remaining</p><p className="text-sm font-bold">₦{fmt(remaining)}</p></div>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {t.member_count}/{t.max_members}</span>
          <span className="flex items-center gap-1"><Wallet className="h-4 w-4" /> ₦{fmt(Number(t.contribution_amount))} / {t.frequency}</span>
          {t.target_date && <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" /> {format(new Date(t.target_date), "MMM d, yyyy")}</span>}
        </div>

        {/* Contribute + Withdraw */}
        {t.status === "active" && (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={async () => {
              const r = await products.contributeTarget(t.id);
              if (r?.data) { toast({ title: "Contributed!" }); loadDetail(t.id); }
            }} disabled={products.loading}>
              <Wallet className="h-4 w-4 mr-2" /> Contribute ₦{fmt(Number(t.contribution_amount))}
            </Button>
            {isIndependent && (
              <Button variant="outline" className="flex-1" onClick={async () => {
                const r = await products.independentWithdrawal(t.id);
                if (r?.data) { toast({ title: "Withdrawn to wallet!" }); loadDetail(t.id); }
              }} disabled={products.loading}>
                <ArrowDownToLine className="h-4 w-4 mr-2" /> Withdraw
              </Button>
            )}
          </div>
        )}

        {/* Closed notice */}
        {isClosed && (
          <div className="p-4 rounded-xl bg-secondary/10 border border-secondary/20 text-center">
            <p className="font-semibold">This Target Ajo is closed</p>
            <p className="text-sm text-muted-foreground mt-1">All contributed funds have been returned to members' wallets.</p>
          </div>
        )}

        {/* Disclaimer */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              {isIndependent
                ? "Each member can withdraw their own contributions directly to their app wallet at any time."
                : "When this Target Ajo is closed, all contributed funds are returned to each member's wallet."}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="activity">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="votes"><Vote className="h-3 w-3 mr-1" /> Votes</TabsTrigger>
          </TabsList>
          <TabsContent value="activity" className="space-y-2 mt-3">
            {contributions.length === 0 ? (
              <p className="text-center py-4 text-sm text-muted-foreground">No contributions yet</p>
            ) : contributions.map((c: any) => (
              <div key={c.id} className="p-3 rounded-lg bg-card border border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{c.display_name || `User ${c.user_id?.slice(0, 6)}`} contributed</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(c.created_at), "MMM d, h:mm a")}</p>
                </div>
                <p className="text-sm font-bold text-primary">₦{fmt(Number(c.amount))}</p>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="members" className="space-y-2 mt-3">
            {members.map((m: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                <span className="font-medium truncate max-w-[180px]">{m.display_name || `User ${m.user_id?.slice(0, 6)}`}</span>
                <span className="font-semibold text-primary">₦{fmt(Number(m.contributed_amount || 0))}</span>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="votes" className="space-y-2 mt-3">
            {withdrawalRequests.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">No withdrawal requests</p>
                {!isIndependent && t.status === "active" && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
                    await products.requestTargetWithdrawal(t.id, 1000, "Test withdrawal");
                    toast({ title: "Withdrawal request submitted!" });
                    loadDetail(t.id);
                  }} disabled={products.loading}>
                    Request Withdrawal
                  </Button>
                )}
              </div>
            ) : withdrawalRequests.map((wr: any) => (
              <div key={wr.id} className="p-3 rounded-lg bg-card border border-border space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">₦{fmt(Number(wr.amount))}</span>
                  <Badge variant="outline">{wr.status}</Badge>
                </div>
                {wr.reason && <p className="text-xs text-muted-foreground">{wr.reason}</p>}
                <p className="text-xs text-muted-foreground">Votes: {wr.current_votes || 0}/{wr.required_votes}</p>
                {wr.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => products.voteTargetWithdrawal(wr.id, "approve").then(() => { toast({ title: "Vote recorded" }); loadDetail(t.id); })} disabled={products.loading}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => products.voteTargetWithdrawal(wr.id, "reject").then(() => { toast({ title: "Vote recorded" }); loadDetail(t.id); })} disabled={products.loading}>Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

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

      {/* Info banner */}
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-start gap-2">
          <Target className="h-4 w-4 text-primary mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Set a shared savings target. Members contribute from their wallets. Withdrawal requires 2/3 member approval (group mode) or is instant (independent mode).
          </p>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Target Savings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Target Name *</Label>
              <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Office Rent Fund" />
            </div>

            {/* Savings Type Cards */}
            <div>
              <Label className="mb-2 block">Savings Type *</Label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setForm(f => ({ ...f, savings_type: "group" }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${form.savings_type === "group" ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <Users className={`h-5 w-5 mb-1 ${form.savings_type === "group" ? "text-primary" : "text-muted-foreground"}`} />
                  <p className="text-sm font-semibold">Group Wallet</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Everyone contributes to one shared pot.</p>
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, savings_type: "independent" }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${form.savings_type === "independent" ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <User className={`h-5 w-5 mb-1 ${form.savings_type === "independent" ? "text-primary" : "text-muted-foreground"}`} />
                  <p className="text-sm font-semibold">Independent</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Each member has their own sub-wallet.</p>
                </button>
              </div>
            </div>

            <div>
              <Label>Reason / Purpose</Label>
              <Textarea placeholder="Why are we saving?" value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} rows={2} />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea placeholder="Additional details..." value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>

            <div>
              <Label>Target Amount (₦) *</Label>
              <Input type="number" value={form.goal_amount} onChange={(e) => setForm(p => ({ ...p, goal_amount: e.target.value }))} placeholder="500000" min={1000} />
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
                <Label>Max Members (incl. you)</Label>
                <Input type="number" value={form.max_members} onChange={(e) => setForm(p => ({ ...p, max_members: e.target.value }))} min={2} max={100} />
              </div>
            </div>

            {/* Auto-calculated contribution */}
            {targetAmount > 0 && maxMembers > 0 && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground mb-1">Contribution per member (auto-calculated)</p>
                <p className="text-lg font-bold">₦{fmt(contributionAmount)}</p>
                <p className="text-xs text-muted-foreground">₦{fmt(targetAmount)} ÷ {maxMembers} members</p>
              </div>
            )}

            {/* Auto target date */}
            <div className="p-3 rounded-lg bg-secondary/5 border border-secondary/20">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Target completion date (auto-calculated)</p>
              </div>
              <p className="text-lg font-bold">{format(autoTargetDate, "PPP")}</p>
              <p className="text-xs text-muted-foreground">{maxMembers} {freqLabel} from today</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground">
                💡 When the target date arrives, each member's contributions are automatically returned to their personal wallet.
              </p>
            </div>

            <Button onClick={handleCreate} disabled={products.loading || !form.name || !form.goal_amount} className="w-full">
              {products.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Target Ajo
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
              <Card key={t.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => loadDetail(t.id)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.frequency} • {t.member_count}/{t.max_members} members •
                        {t.savings_type === "independent" ? " Independent" : " Group"}
                      </p>
                    </div>
                    <Badge variant="outline" className={t.status === "active" ? "text-green-600 border-green-500" : t.status === "completed" ? "text-primary border-primary" : "text-muted-foreground"}>
                      {t.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>₦{fmt(Number(t.total_contributed))}</span>
                      <span>₦{fmt(Number(t.goal_amount))}</span>
                    </div>
                    <Progress value={Math.min(100, progress)} className="h-2" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ₦{fmt(Number(t.contribution_amount))} / {t.frequency}
                    {t.target_date && ` • Target: ${new Date(t.target_date).toLocaleDateString()}`}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
