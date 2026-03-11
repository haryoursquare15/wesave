import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Target, Clock, UserPlus, Wallet, AlertTriangle, Vote, User, ArrowDownToLine, Ban, Bell, UserMinus, CalendarPlus } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useTargetAjoDetail } from "@/hooks/useTargetAjo";
import { TargetAjoInviteDialog } from "@/components/target-ajo/TargetAjoInviteDialog";
import { TargetAjoContributeDialog } from "@/components/target-ajo/TargetAjoContributeDialog";
import { WithdrawalVoteCard } from "@/components/target-ajo/WithdrawalVoteCard";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import type { TargetAjoMemberContribution } from "@/hooks/useTargetAjo";

interface MemberProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export default function TargetAjoDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { group, members, contributions, withdrawalRequests, votes, loading, isAdmin, isMember, refetch } = useTargetAjoDetail(groupId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [contributeOpen, setContributeOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [requestingWithdraw, setRequestingWithdraw] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<Map<string, MemberProfile>>(new Map());
  const [memberContributions, setMemberContributions] = useState<TargetAjoMemberContribution[]>([]);
  const [selfWithdrawing, setSelfWithdrawing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Fetch member profiles
  useEffect(() => {
    const fetchProfiles = async () => {
      if (!members.length && !group) return;
      const userIds = [...new Set([
        ...members.map(m => m.user_id),
        ...(group ? [group.admin_user_id] : []),
      ])];
      if (!userIds.length) return;

      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .in("id", userIds);

      if (data) {
        const map = new Map<string, MemberProfile>();
        data.forEach(p => map.set(p.id, p));
        setMemberProfiles(map);
      }
    };
    fetchProfiles();
  }, [members, group]);

  // Fetch per-member contribution totals
  useEffect(() => {
    const fetchMemberContribs = async () => {
      if (!groupId) return;
      const { data } = await (supabase as any)
        .from("target_ajo_member_contributions")
        .select("*")
        .eq("group_id", groupId);
      setMemberContributions(data || []);
    };
    fetchMemberContribs();
  }, [groupId, contributions]);

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  const getMemberName = (userId: string) => {
    if (userId === user?.id) return "You";
    const profile = memberProfiles.get(userId);
    if (profile) return profile.full_name || profile.username || userId.slice(0, 8);
    return userId.slice(0, 8);
  };

  const getMemberContribution = (userId: string) => {
    return memberContributions.find(mc => mc.user_id === userId)?.total_contributed || 0;
  };

  // Independent mode: withdraw own contributions via atomic RPC
  const handleSelfWithdraw = async () => {
    if (!user || !group) return;
    const myTotal = getMemberContribution(user.id);
    if (myTotal <= 0) { toast.error("No contributions to withdraw"); return; }

    setSelfWithdrawing(true);
    try {
      const { data, error } = await supabase.rpc("target_ajo_self_withdraw" as any, {
        _group_id: group.id,
        _user_id: user.id,
      } as any);

      if (error) throw error;
      const result = data as { success: boolean; error?: string; amount?: number };
      if (!result.success) {
        toast.error(result.error || "Withdrawal failed");
        return;
      }
      toast.success(`₦${fmt(result.amount || myTotal)} withdrawn to your wallet!`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Withdrawal failed");
    } finally {
      setSelfWithdrawing(false);
    }
  };

  // Admin: Close group and refund all members
  const handleCloseAndRefund = async () => {
    if (!user || !group) return;
    setClosing(true);
    try {
      const { data, error } = await supabase.rpc("complete_target_ajo_and_refund" as any, {
        _group_id: group.id,
        _admin_id: user.id,
      } as any);

      if (error) throw error;
      const result = data as { success: boolean; error?: string; refund_count?: number; total_refunded?: number };
      if (!result.success) {
        toast.error(result.error || "Failed to close group");
        return;
      }
      toast.success(`Group closed! ₦${fmt(result.total_refunded || 0)} refunded to ${result.refund_count || 0} member(s).`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to close group");
    } finally {
      setClosing(false);
    }
  };

  // Admin: Remove member
  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (!user || !group) return;
    setRemovingId(memberUserId);
    try {
      await (supabase as any).from("target_ajo_memberships").delete().eq("id", memberId);
      // Update member count
      await (supabase as any).from("target_ajo_groups")
        .update({ member_count: Math.max(0, (group.member_count || members.length) - 1), updated_at: new Date().toISOString() })
        .eq("id", group.id);

      toast.success(`${getMemberName(memberUserId)} removed`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  // Admin: Send reminder
  const handleSendReminder = async () => {
    if (!user || !group) return;
    try {
      const memberIds = members.map(m => m.user_id).filter(id => id !== user.id);
      if (memberIds.length === 0) { toast.info("No members to remind"); return; }

      const notifications = memberIds.map(uid => ({
        user_id: uid,
        title: "Contribution Reminder 💰",
        message: `Don't forget to contribute to "${group.name}". Target: ₦${fmt(group.target_amount)}, Raised: ₦${fmt(group.amount_raised)}.`,
        notification_type: "target_ajo_reminder",
      }));

      for (const notif of notifications) {
        try {
          await (supabase.rpc as any)("insert_user_notification", {
            _user_id: notif.user_id,
            _title: notif.title,
            _message: notif.message,
            _notification_type: notif.notification_type,
          });
        } catch {}
      }

      toast.success(`Reminder sent to ${memberIds.length} member(s)`);
    } catch (err: any) {
      toast.error("Failed to send reminders");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Target className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Target not found</p>
        <Button onClick={() => navigate("/target-ajo")}>Back</Button>
      </div>
    );
  }

  const progress = group.target_amount > 0 ? (group.amount_raised / group.target_amount) * 100 : 0;
  const remaining = Math.max(0, group.target_amount - group.amount_raised);
  const isIndependent = group.savings_type === "independent";
  const isGroupClosed = group.status === "closed" || group.status === "completed" || group.status === "cancelled";

  const handleWithdrawalRequest = async () => {
    if (!user) return;
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 100) { toast.error("Enter a valid amount"); return; }
    if (amt > group.amount_raised) { toast.error("Cannot exceed amount raised"); return; }

    setRequestingWithdraw(true);
    try {
      const requiredVotes = Math.ceil((members.length * 2) / 3);
      const { error } = await (supabase as any).from("target_ajo_withdrawal_requests").insert({
        group_id: group.id,
        requested_by: user.id,
        amount: amt,
        reason: withdrawReason.trim() || null,
        required_votes: requiredVotes,
      });
      if (error) throw error;
      toast.success("Withdrawal request submitted! Members need to vote.");
      setWithdrawAmount("");
      setWithdrawReason("");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to request withdrawal");
    } finally {
      setRequestingWithdraw(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground line-clamp-1">{group.name}</h1>
          </div>
          {isMember && group.status === "active" && (
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> Invite
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Status & Info */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant={group.status === "active" ? "default" : group.status === "closed" ? "secondary" : "outline"}>
              {group.status === "closed" ? "Completed — Funds Returned" : group.status}
            </Badge>
            <Badge variant="outline">{group.frequency}</Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              {isIndependent ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {isIndependent ? "Independent" : "Group Wallet"}
            </Badge>
            {isAdmin && <Badge variant="outline">Admin</Badge>}
            {isMember && !isAdmin && <Badge variant="outline">Member</Badge>}
          </div>

          {group.reason && (
            <p className="text-sm text-muted-foreground mb-4">{group.reason}</p>
          )}

          {group.description && (
            <p className="text-sm text-muted-foreground mb-4">{group.description}</p>
          )}

          {/* Progress Card */}
          <div className="p-4 rounded-xl bg-card border border-border mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                {isIndependent ? "Aggregate Progress" : "Target Progress"}
              </span>
              <span className="font-bold text-primary">{progress.toFixed(0)}%</span>
            </div>
            <Progress value={Math.min(progress, 100)} className="h-3 mb-3" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Raised</p>
                <p className="text-sm font-bold text-foreground">₦{fmt(group.amount_raised)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Target</p>
                <p className="text-sm font-bold text-foreground">₦{fmt(group.target_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-sm font-bold text-foreground">₦{fmt(remaining)}</p>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4 flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {members.length} / {group.max_members} members
            </span>
            <span className="flex items-center gap-1">
              <Wallet className="h-4 w-4" /> ₦{fmt(group.contribution_amount)} / {group.frequency}
            </span>
            {group.target_date && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" /> {format(new Date(group.target_date), "MMM d, yyyy")}
              </span>
            )}
          </div>

          {/* Closed notice */}
          {isGroupClosed && (
            <div className="p-4 rounded-xl bg-secondary/10 border border-secondary/20 mb-4 text-center">
              <p className="font-semibold text-foreground">This Target Ajo is closed</p>
              <p className="text-sm text-muted-foreground mt-1">All contributed funds have been returned to members' wallets.</p>
            </div>
          )}

          {/* Non-member notice */}
          {!isMember && !isGroupClosed && (
            <div className="p-4 rounded-xl bg-muted/30 border border-border mb-4 text-center">
              <p className="text-sm text-muted-foreground">
                This is an invite-only group. Ask a member or the admin to invite you.
              </p>
            </div>
          )}

          {/* Contribute button for members */}
          {group.status === "active" && isMember && (
            <div className="flex gap-2 mb-4">
              <Button className="flex-1" size="lg" onClick={() => setContributeOpen(true)}>
                <Wallet className="h-5 w-5 mr-2" /> Contribute Now
              </Button>
              {isIndependent && getMemberContribution(user?.id || "") > 0 && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleSelfWithdraw}
                  disabled={selfWithdrawing}
                  className="flex-1"
                >
                  <ArrowDownToLine className="h-5 w-5 mr-2" />
                  {selfWithdrawing ? "Withdrawing..." : `Withdraw ₦${fmt(getMemberContribution(user?.id || ""))}`}
                </Button>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border mb-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                {isIndependent
                  ? "Each member can withdraw their own contributions directly to their app wallet at any time."
                  : "When this Target Ajo is closed, all contributed funds are returned to each member's wallet based on their individual contributions."
                }
              </p>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="contributions" className="space-y-4">
          <TabsList className={`grid w-full ${isAdmin ? "grid-cols-4" : "grid-cols-3"}`}>
            <TabsTrigger value="contributions">Activity</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="withdrawals">
              <Vote className="h-3 w-3 mr-1" /> Votes
            </TabsTrigger>
            {isAdmin && <TabsTrigger value="manage">Manage</TabsTrigger>}
          </TabsList>

          {/* Contributions Tab */}
          <TabsContent value="contributions">
            <div className="space-y-2">
              {contributions.length === 0 ? (
                <p className="text-center py-6 text-sm text-muted-foreground">No contributions yet</p>
              ) : (
                contributions.map((c) => (
                  <div key={c.id} className="p-3 rounded-lg bg-card border border-border flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {getMemberName(c.user_id)} contributed
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(c.created_at), "MMM d, h:mm a")} • {c.source}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">₦{fmt(c.amount)}</p>
                      <Badge variant={c.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <div className="space-y-2">
              {/* Admin */}
              <div className="p-3 rounded-lg bg-card border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {(getMemberName(group.admin_user_id)?.[0] || "?").toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        👑 {getMemberName(group.admin_user_id)}
                      </p>
                      <p className="text-xs text-muted-foreground">Creator</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="default">Admin</Badge>
                    <p className="text-xs font-semibold text-primary mt-1">
                      ₦{fmt(getMemberContribution(group.admin_user_id))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Other members */}
              {members
                .filter(m => m.user_id !== group.admin_user_id)
                .map((m) => {
                  const name = getMemberName(m.user_id);
                  const memberTotal = getMemberContribution(m.user_id);
                  return (
                    <div key={m.id} className="p-3 rounded-lg bg-card border border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                            {(name?.[0] || "?").toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{name}</p>
                            <p className="text-xs text-muted-foreground">
                              Joined {format(new Date(m.joined_at), "MMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <p className="text-xs font-semibold text-primary">₦{fmt(memberTotal)}</p>
                          </div>
                          {isAdmin && group.status === "active" && m.user_id !== user?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => handleRemoveMember(m.id, m.user_id)}
                              disabled={removingId === m.user_id}
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

              {members.length === 0 && (
                <p className="text-center py-4 text-sm text-muted-foreground">No other members yet. Invite friends to join!</p>
              )}
            </div>
          </TabsContent>

          {/* Withdrawals / Votes Tab */}
          <TabsContent value="withdrawals">
            <div className="space-y-3">
              {!isIndependent && (
                <p className="text-xs text-muted-foreground mb-2">
                  Group wallet withdrawals require 2/3 member approval. When the group is closed by the admin, all funds are automatically returned to each member.
                </p>
              )}
              {withdrawalRequests.length === 0 ? (
                <p className="text-center py-6 text-sm text-muted-foreground">No withdrawal requests</p>
              ) : (
                withdrawalRequests.map((wr) => (
                  <WithdrawalVoteCard
                    key={wr.id}
                    request={wr}
                    votes={votes.filter((v) => v.withdrawal_request_id === wr.id)}
                    isAdmin={isAdmin}
                    onRefresh={refetch}
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* Admin Manage Tab */}
          {isAdmin && (
            <TabsContent value="manage">
              <div className="space-y-4">
                {/* Send Reminders */}
                {group.status === "active" && (
                  <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Bell className="h-4 w-4" /> Send Reminder
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Notify all members to contribute to this target.
                    </p>
                    <Button variant="outline" className="w-full" onClick={handleSendReminder}>
                      <Bell className="h-4 w-4 mr-2" /> Send Contribution Reminder
                    </Button>
                  </div>
                )}

                {/* Request Withdrawal - only for group mode */}
                {!isIndependent && group.status === "active" && (
                  <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                    <h3 className="font-semibold text-foreground">Request Withdrawal</h3>
                    <p className="text-xs text-muted-foreground">
                      Submit a withdrawal request. 2/3 of members ({Math.ceil((members.length * 2) / 3)}) must approve.
                    </p>
                    <div className="space-y-2">
                      <input
                        type="number"
                        placeholder="Amount (₦)"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                      />
                      <input
                        placeholder="Reason (optional)"
                        value={withdrawReason}
                        onChange={(e) => setWithdrawReason(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                      />
                      <Button className="w-full" onClick={handleWithdrawalRequest} disabled={requestingWithdraw}>
                        {requestingWithdraw ? "Submitting..." : "Request Withdrawal"}
                      </Button>
                    </div>
                  </div>
                )}

                {isIndependent && (
                  <div className="p-4 rounded-xl bg-card border border-border">
                    <h3 className="font-semibold text-foreground mb-2">Independent Mode</h3>
                    <p className="text-xs text-muted-foreground">
                      Each member manages their own contributions and can withdraw directly to their app wallet. No group voting required.
                    </p>
                  </div>
                )}

                {/* Funds Distribution Info - group mode */}
                {!isIndependent && (
                  <div className="p-4 rounded-xl bg-card border border-border">
                    <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary" /> Funds Distribution
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      When the target is achieved or the group is closed, all contributed funds are automatically split and returned to each member's personal wallet based on their individual contributions.
                    </p>
                  </div>
                )}

                {/* Close Group */}
                {group.status === "active" && (
                  <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 space-y-3">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Ban className="h-4 w-4 text-destructive" /> Close Target Ajo
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Closing this group will immediately return all contributed funds to each member's wallet based on their total contributions. This action cannot be undone.
                    </p>
                    {group.amount_raised > 0 && (
                      <p className="text-xs text-foreground font-medium">
                        ₦{fmt(group.amount_raised)} will be distributed back to {memberContributions.filter(mc => mc.total_contributed > 0).length} member(s).
                      </p>
                    )}
                    <Button variant="destructive" className="w-full" onClick={handleCloseAndRefund} disabled={closing}>
                      <Ban className="h-4 w-4 mr-2" />
                      {closing ? "Closing..." : "Close & Return Funds"}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>

      {group && group.status === "active" && (
        <>
          <TargetAjoInviteDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            groupId={group.id}
            onSuccess={() => { setInviteOpen(false); refetch(); }}
          />
          <TargetAjoContributeDialog
            open={contributeOpen}
            onOpenChange={setContributeOpen}
            group={group}
            onSuccess={refetch}
          />
        </>
      )}

      <BottomNav />
    </div>
  );
}
