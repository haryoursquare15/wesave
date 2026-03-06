import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Target, Clock, UserPlus, Wallet, AlertTriangle, Vote } from "lucide-react";
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

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

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

  // Get member profiles for display
  const getMemberName = (userId: string) => {
    if (userId === user?.id) return "You";
    return userId.slice(0, 8);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground line-clamp-1">{group.name}</h1>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> Invite
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Status & Info */}
          <div className="flex items-center gap-2 mb-3">
            <Badge variant={group.status === "active" ? "default" : "secondary"}>{group.status}</Badge>
            <Badge variant="outline">{group.frequency}</Badge>
            {isAdmin && <Badge variant="outline">Admin</Badge>}
          </div>

          {group.reason && (
            <p className="text-sm text-muted-foreground mb-4">{group.reason}</p>
          )}

          {/* Progress Card */}
          <div className="p-4 rounded-xl bg-card border border-border mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Target Progress</span>
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
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {members.length} members
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

          {/* Contribute button */}
          {group.status === "active" && isMember && (
            <Button className="w-full mb-4" size="lg" onClick={() => setContributeOpen(true)}>
              <Wallet className="h-5 w-5 mr-2" /> Contribute Now
            </Button>
          )}

          {/* Disclaimer */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border mb-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Withdrawals require approval from at least 2/3 of members. Funds are disbursed to the designated beneficiary account.
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
              {members.map((m) => (
                <div key={m.id} className="p-3 rounded-lg bg-card border border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {m.user_id === group.admin_user_id ? "👑 " : ""}{getMemberName(m.user_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Joined {format(new Date(m.joined_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Badge variant="outline">{m.status}</Badge>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Withdrawals / Votes Tab */}
          <TabsContent value="withdrawals">
            <div className="space-y-3">
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
                {/* Request Withdrawal */}
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

                {/* Beneficiary Info */}
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-semibold text-foreground mb-2">Beneficiary Account</h3>
                  <div className="text-sm space-y-1">
                    <p className="text-muted-foreground">Name: <span className="text-foreground">{group.beneficiary_account_name || "—"}</span></p>
                    <p className="text-muted-foreground">Bank: <span className="text-foreground">{group.beneficiary_bank_name || "—"}</span></p>
                    <p className="text-muted-foreground">Account: <span className="text-foreground">{group.beneficiary_account_number || "—"}</span></p>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>

      {group && (
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
