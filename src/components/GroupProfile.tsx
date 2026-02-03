import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Users, Calendar, Coins, Crown, Clock, 
  TrendingUp, CheckCircle, AlertCircle, Wallet
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface GroupProfileProps {
  groupId: string;
  group: {
    id: string;
    name: string;
    description: string | null;
    max_members: number;
    contribution_amount: number;
    period: string;
    status: string;
    admin_id: string;
    current_cycle: number;
    created_at: string | null;
    contribution_day_of_month?: number | null;
    contribution_day_of_week?: number | null;
    contribution_hour?: number | null;
  };
  memberCount: number;
}

interface ContributionAudit {
  id: string;
  user_id: string;
  amount: number;
  contribution_type: string;
  status: string;
  created_at: string;
  cycle_id: string;
  profile?: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

interface CycleInfo {
  id: string;
  cycle_number: number;
  status: string;
  completed_at: string | null;
  payout_amount: number | null;
}

interface MemberContributionStats {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  total_contributions: number;
  contribution_count: number;
}

export function GroupProfile({ groupId, group, memberCount }: GroupProfileProps) {
  const [contributionAudit, setContributionAudit] = useState<ContributionAudit[]>([]);
  const [cycles, setCycles] = useState<CycleInfo[]>([]);
  const [memberStats, setMemberStats] = useState<MemberContributionStats[]>([]);
  const [groupWalletBalance, setGroupWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch group wallet balance
        const { data: wallet } = await supabase
          .from("group_wallets")
          .select("contribution_balance")
          .eq("group_id", groupId)
          .single();

        if (wallet) {
          setGroupWalletBalance(Number(wallet.contribution_balance) || 0);
        }

        // Fetch all cycles for this group
        const { data: cyclesData } = await supabase
          .from("contribution_cycles")
          .select("id, cycle_number, status, completed_at, payout_amount")
          .eq("group_id", groupId)
          .order("cycle_number", { ascending: false });
        
        if (cyclesData) {
          setCycles(cyclesData);
        }

        // Fetch contribution audit
        const { data: audit } = await supabase
          .from("contribution_audit")
          .select("*, cycle_id")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .limit(100);

        if (audit && audit.length > 0) {
          const userIds = [...new Set(audit.map((a) => a.user_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, username, avatar_url")
            .in("id", userIds);

          const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

          const auditWithProfiles = audit.map((a) => ({
            ...a,
            profile: profileMap.get(a.user_id),
          }));

          setContributionAudit(auditWithProfiles);

          // Calculate member stats
          const stats = new Map<string, MemberContributionStats>();
          for (const a of auditWithProfiles) {
            const existing = stats.get(a.user_id);
            const profile = profileMap.get(a.user_id);
            if (existing) {
              existing.total_contributions += Number(a.amount);
              existing.contribution_count += 1;
            } else {
              stats.set(a.user_id, {
                user_id: a.user_id,
                full_name: profile?.full_name || null,
                username: profile?.username || null,
                avatar_url: profile?.avatar_url || null,
                total_contributions: Number(a.amount),
                contribution_count: 1,
              });
            }
          }
          setMemberStats(Array.from(stats.values()));
        }
      } catch (err) {
        console.error("Error fetching group profile data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [groupId]);

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getDayName = (day: number) => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[day] || "Unknown";
  };

  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 || 12;
    return `${h}:00 ${ampm}`;
  };

  const getScheduleText = () => {
    if (group.period === "daily") {
      return `Daily at ${formatHour(group.contribution_hour || 9)}`;
    } else if (group.period === "weekly") {
      return `Every ${getDayName(group.contribution_day_of_week || 1)} at ${formatHour(group.contribution_hour || 9)}`;
    } else {
      return `Day ${group.contribution_day_of_month || 1} of every month`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalPool = group.contribution_amount * group.max_members;
  const progressPercent = totalPool > 0 ? (groupWalletBalance / totalPool) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Group Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Group Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Members</p>
              <p className="text-lg font-semibold">{memberCount}/{group.max_members}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Contribution</p>
              <p className="text-lg font-semibold">₦{group.contribution_amount.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Period</p>
              <p className="text-lg font-semibold capitalize">{group.period}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Current Cycle</p>
              <p className="text-lg font-semibold">{group.current_cycle}</p>
            </div>
          </div>

          {/* Auto-Contribution Schedule */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Auto-Contribution Schedule</span>
            </div>
            <p className="text-sm text-muted-foreground">{getScheduleText()}</p>
          </div>
        </CardContent>
      </Card>

      {/* Group Wallet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Group Wallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">
                ₦{groupWalletBalance.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                of ₦{totalPool.toLocaleString()} target
              </p>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progressPercent, 100)}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-gradient-to-r from-primary to-primary/70"
              />
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {progressPercent.toFixed(0)}% of cycle contributions collected
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Member Contribution Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Member Contributions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memberStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No contributions recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {memberStats.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">
                      {member.username ? `@${member.username}` : member.full_name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.contribution_count} contribution{member.contribution_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary">
                      ₦{member.total_contributions.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contribution Audit Trail - Grouped by Cycle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Contribution History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contributionAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No contribution history yet.
            </p>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-6">
                {cycles.map((cycle) => {
                  const cycleContributions = contributionAudit.filter(
                    (a) => a.cycle_id === cycle.id
                  );
                  
                  if (cycleContributions.length === 0) return null;
                  
                  return (
                    <div key={cycle.id}>
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                        <div className="flex items-center gap-2">
                          <Badge variant={cycle.status === "completed" ? "success" : "default"}>
                            Cycle {cycle.cycle_number}
                          </Badge>
                          {cycle.status === "completed" && (
                            <span className="text-xs text-muted-foreground">
                              Completed {cycle.completed_at ? format(new Date(cycle.completed_at), "MMM d, yyyy") : ""}
                            </span>
                          )}
                        </div>
                        {cycle.payout_amount && cycle.payout_amount > 0 && (
                          <span className="text-xs font-medium text-success">
                            Payout: ₦{Number(cycle.payout_amount).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {cycleContributions.map((audit) => (
                          <div
                            key={audit.id}
                            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={audit.profile?.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {getInitials(audit.profile?.full_name || null)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {audit.profile?.username ? `@${audit.profile.username}` : audit.profile?.full_name || "Unknown"}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{format(new Date(audit.created_at), "MMM d, h:mm a")}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {audit.contribution_type}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">
                                ₦{Number(audit.amount).toLocaleString()}
                              </span>
                              <CheckCircle className="h-4 w-4 text-success" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
