import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Target, Users, User, CalendarDays } from "lucide-react";
import { addDays, addWeeks, addMonths, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function CreateTargetAjo() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    target_amount: "",
    frequency: "monthly",
    reason: "",
    max_members: "20",
    savings_type: "group" as "group" | "independent",
  });

  const targetAmount = parseFloat(form.target_amount) || 0;
  const maxMembers = parseInt(form.max_members) || 1;
  const contributionAmount = maxMembers > 0 ? Math.ceil(targetAmount / maxMembers) : 0;

  // Auto-calculate target date based on frequency and members
  const autoTargetDate = useMemo(() => {
    const members = parseInt(form.max_members) || 1;
    const startDate = new Date();
    switch (form.frequency) {
      case "daily": return addDays(startDate, members);
      case "weekly": return addWeeks(startDate, members);
      case "monthly": return addMonths(startDate, members);
      default: return addDays(startDate, members);
    }
  }, [form.frequency, form.max_members]);

  const frequencyLabel = form.frequency === "daily" ? "days" : form.frequency === "weekly" ? "weeks" : "months";

  // Member invitation state
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const searchUsers = async () => {
    if (!memberQuery.trim() || memberQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const escaped = memberQuery.trim().replace(/[%_\\]/g, "\\$&");
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .or(`username.ilike.%${escaped}%,full_name.ilike.%${escaped}%`)
        .neq("id", user?.id || "")
        .limit(10);
      // Filter out already selected
      const selectedIds = new Set(selectedMembers.map(m => m.id));
      setMemberResults((data || []).filter(u => !selectedIds.has(u.id)));
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const addMember = (member: any) => {
    setSelectedMembers(prev => [...prev, member]);
    setMemberResults(prev => prev.filter(m => m.id !== member.id));
  };

  const removeMember = (memberId: string) => {
    setSelectedMembers(prev => prev.filter(m => m.id !== memberId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (isNaN(targetAmount) || targetAmount < 1000) { toast.error("Target must be at least ₦1,000"); return; }
    if (contributionAmount < 100) { toast.error("Contribution per member is too low. Increase target or reduce members."); return; }

    setSubmitting(true);
    try {
      const { data: group, error } = await (supabase as any).from("target_ajo_groups").insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
        target_amount: targetAmount,
        contribution_amount: contributionAmount,
        frequency: form.frequency,
        target_date: autoTargetDate.toISOString(),
        reason: form.reason.trim() || null,
        admin_user_id: user.id,
        max_members: parseInt(form.max_members) || 20,
        member_count: 1 + selectedMembers.length,
        savings_type: form.savings_type,
      }).select().single();

      if (error) throw error;

      // Add admin as member
      await (supabase as any).from("target_ajo_memberships").insert({
        group_id: group.id,
        user_id: user.id,
        status: "active",
      });

      // Send invites to selected members
      if (selectedMembers.length > 0) {
        const invites = selectedMembers.map(m => ({
          group_id: group.id,
          inviter_id: user.id,
          invitee_id: m.id,
        }));
        await (supabase as any).from("target_ajo_invites").insert(invites);
      }

      toast.success("Target Ajo created!" + (selectedMembers.length > 0 ? ` ${selectedMembers.length} invite(s) sent.` : ""));
      navigate(`/target-ajo/${group.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create target");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Create Target Ajo</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/20 mb-6"
        >
          <div className="flex items-start gap-3">
            <Target className="h-5 w-5 text-primary mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Set a shared savings target. Members contribute from their wallets on the schedule you choose. Withdrawal requires 2/3 member approval.
            </p>
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>Target Name *</Label>
            <Input placeholder="e.g. Office Rent Fund" value={form.name} onChange={(e) => update("name", e.target.value)} maxLength={100} />
          </div>

          {/* Savings Type */}
          <div>
            <Label className="mb-2 block">Savings Type *</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, savings_type: "group" }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  form.savings_type === "group"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <Users className={`h-6 w-6 mb-2 ${form.savings_type === "group" ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm font-semibold text-foreground">Group Wallet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Everyone contributes to one shared pot. Total is pooled together.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, savings_type: "independent" }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  form.savings_type === "independent"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <User className={`h-6 w-6 mb-2 ${form.savings_type === "independent" ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm font-semibold text-foreground">Independent</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Each member has their own sub-wallet. Everyone sees aggregate progress.
                </p>
              </button>
            </div>
          </div>

          <div>
            <Label>Reason / Purpose</Label>
            <Textarea placeholder="Why are we saving?" value={form.reason} onChange={(e) => update("reason", e.target.value)} rows={2} maxLength={500} />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea placeholder="Additional details..." value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} maxLength={1000} />
          </div>

          <div>
            <Label>Target Amount (₦) *</Label>
            <Input type="number" placeholder="500000" value={form.target_amount} onChange={(e) => update("target_amount", e.target.value)} min={1000} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency *</Label>
              <Select value={form.frequency} onValueChange={(v) => update("frequency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max Members</Label>
              <Input type="number" value={form.max_members} onChange={(e) => update("max_members", e.target.value)} min={2} max={100} />
            </div>
          </div>

          {/* Auto-calculated contribution */}
          {targetAmount > 0 && maxMembers > 0 && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground mb-1">Contribution per member (auto-calculated)</p>
              <p className="text-lg font-bold text-foreground">
                ₦{new Intl.NumberFormat("en-NG").format(contributionAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                ₦{new Intl.NumberFormat("en-NG").format(targetAmount)} ÷ {maxMembers} members
              </p>
            </div>
          )}

          {/* Auto-calculated target date */}
          <div className="p-3 rounded-lg bg-secondary/5 border border-secondary/20">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Target completion date (auto-calculated)</p>
            </div>
            <p className="text-lg font-bold text-foreground">
              {format(autoTargetDate, "PPP")}
            </p>
            <p className="text-xs text-muted-foreground">
              {maxMembers} {frequencyLabel} from today ({form.frequency} × {maxMembers} members)
            </p>
          </div>

          {/* Add Members */}
          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Add Members (Invite)</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Search and invite members to join. Only invited members can participate.
            </p>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="Search by name or username..."
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchUsers())}
              />
              <Button type="button" size="sm" variant="outline" onClick={searchUsers} disabled={searching}>
                {searching ? "..." : "Search"}
              </Button>
            </div>

            {/* Search results */}
            {memberResults.length > 0 && (
              <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                {memberResults.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.full_name || u.username || "User"}</p>
                      <p className="text-xs text-muted-foreground">@{u.username || u.email?.split("@")[0]}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => addMember(u)}>Add</Button>
                  </div>
                ))}
              </div>
            )}

            {/* Selected members */}
            {selectedMembers.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-1">{selectedMembers.length} member(s) to invite:</p>
                {selectedMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm font-medium text-foreground">{m.full_name || m.username || "User"}</p>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeMember(m.id)} className="text-destructive h-7 px-2">
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <p className="text-xs text-muted-foreground">
              💡 When the target date arrives, each member's contributions are automatically returned to their personal wallet.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating..." : "Create Target Ajo"}
          </Button>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}
