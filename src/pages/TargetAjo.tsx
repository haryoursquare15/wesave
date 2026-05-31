import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Target, Search, Mail, Check, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useTargetAjoGroups, useTargetAjoInvites } from "@/hooks/useTargetAjo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { getUserFriendlyError } from "@/lib/errorMessages";
export default function TargetAjo() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { myGroups, loading, refetch: refetchGroups } = useTargetAjoGroups();
  const { pendingInvites, loading: invitesLoading, refetch: refetchInvites } = useTargetAjoInvites();
  const [search, setSearch] = useState("");
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const tab = "mine";

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  const displayed = myGroups;
  const filtered = displayed.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleInviteResponse = async (inviteId: string, groupId: string, accept: boolean) => {
    if (!user) return;
    setRespondingId(inviteId);
    try {
      // Update invite status
      const { error: updateErr } = await (supabase as any)
        .from("target_ajo_invites")
        .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
        .eq("id", inviteId);
      if (updateErr) throw updateErr;

      if (accept) {
        // Add as member
        const { error: memberErr } = await (supabase as any)
          .from("target_ajo_memberships")
          .insert({ group_id: groupId, user_id: user.id, status: "active" });
        if (memberErr) throw memberErr;

        // Increment member_count
        const { data: grp } = await (supabase as any)
          .from("target_ajo_groups")
          .select("member_count")
          .eq("id", groupId)
          .single();
        if (grp) {
          await (supabase as any)
            .from("target_ajo_groups")
            .update({ member_count: (grp.member_count || 0) + 1 })
            .eq("id", groupId);
        }

        toast.success("You've joined the Target Ajo group!");
      } else {
        toast.info("Invite declined.");
      }

      refetchInvites();
      refetchGroups();
    } catch (err: any) {
      toast.error(getUserFriendlyError(err.message || "Failed to respond to invite"));
    } finally {
      setRespondingId(null);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold text-foreground">Target Ajo</h1>
            </div>
            <Link to="/target-ajo/create">
              <Button size="default" className="shadow-md">
                <Plus className="h-5 w-5 mr-1" /> Create
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Info */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-muted-foreground">
            Target Ajo groups are invite-only. Create one and invite your friends, or accept an invite to join.
          </p>
        </div>

        {/* Pending Invites */}
        {!invitesLoading && pendingInvites.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Pending Invites ({pendingInvites.length})
            </h2>
            {pendingInvites.map((inv) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-card border-2 border-primary/30 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{inv.group_name || "Target Ajo Group"}</p>
                    <p className="text-xs text-muted-foreground">You've been invited to join</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/30 h-8"
                      disabled={respondingId === inv.id}
                      onClick={() => handleInviteResponse(inv.id, inv.group_id, false)}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Decline
                    </Button>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={respondingId === inv.id}
                      onClick={() => handleInviteResponse(inv.id, inv.group_id, true)}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Accept
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search targets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>{tab === "mine" ? "You haven't joined any targets yet." : "No targets found."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((g) => {
              const progress = g.target_amount > 0 ? (g.amount_raised / g.target_amount) * 100 : 0;
              return (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate(`/target-ajo/${g.id}`)}
                  className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-foreground">{g.name}</h3>
                      {g.reason && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{g.reason}</p>
                      )}
                    </div>
                    <Badge variant={g.status === "active" ? "default" : "secondary"}>
                      {g.status}
                    </Badge>
                  </div>
                  <Progress value={Math.min(progress, 100)} className="h-2 mb-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>₦{fmt(g.amount_raised)} / ₦{fmt(g.target_amount)}</span>
                    <span>{g.member_count} members • {g.frequency}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
