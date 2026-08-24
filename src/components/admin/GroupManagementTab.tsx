import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminGroups } from "@/hooks/useAdmin";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// LEGACY (WeSave decommission): this file still queries dropped tables/RPCs.
// Kept as dead code pending a dedicated frontend cleanup pass.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  Search, ChevronDown, ChevronRight, Users, Wallet, Calendar, 
  ExternalLink, Pause, Play, Trash2, UserMinus, Download, Zap, RefreshCw
} from "lucide-react";
import { exportToCSV } from "@/lib/exportUtils";

interface GroupDetailsRowProps {
  groupId: string;
  source?: "legacy" | "sandbox";
  onRefresh: () => void;
}

function GroupDetailsRow({ groupId, source = "legacy", onRefresh }: GroupDetailsRowProps) {
  const [data, setData] = useState<{ members: any[]; wallet: any; currentCycle: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const { hasPermission } = useAdminPermissions();
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [groupId, source]);

  const fetchData = async () => {
    try {
      if (source === "sandbox") {
        const [membersRes, groupRes, cycleRes] = await Promise.all([
          supabase.from("vfd_sandbox_group_members")
            .select("id, user_id, payout_position, status, has_contributed_current, has_received_payout, outstanding_owed, payout_blocked")
            .eq("group_id", groupId),
          supabase.from("vfd_sandbox_groups")
            .select("pool_ledger_balance, total_contributed_kobo, total_paid_out_kobo, current_cycle, status")
            .eq("id", groupId)
            .maybeSingle(),
          supabase.from("vfd_sandbox_contribution_cycles")
            .select("*")
            .eq("group_id", groupId)
            .order("cycle_number", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        // Resolve member names
        const userIds = (membersRes.data || []).map((m: any) => m.user_id);
        const profileMap = new Map<string, any>();
        if (userIds.length) {
          const { data: profiles } = await supabase.from("profiles")
            .select("id, full_name, email, username").in("id", userIds);
          (profiles || []).forEach((p: any) => profileMap.set(p.id, p));
        }
        const members = (membersRes.data || []).map((m: any) => ({
          ...m,
          profiles: profileMap.get(m.user_id) || null,
        }));

        const wallet = groupRes.data
          ? { contribution_balance: Number(groupRes.data.pool_ledger_balance || 0) / 100 }
          : null;

        setData({ members, wallet, currentCycle: cycleRes.data });
      } else {
        const [membersRes, walletRes, cycleRes] = await Promise.all([
          supabase.from("group_memberships")
            .select("*, profiles:user_id(full_name, email, username)")
            .eq("group_id", groupId),
          supabase.from("group_wallets")
            .select("*")
            .eq("group_id", groupId)
            .maybeSingle(),
          supabase.from("contribution_cycles")
            .select("*")
            .eq("group_id", groupId)
            .eq("status", "active")
            .maybeSingle(),
        ]);

        setData({
          members: membersRes.data || [],
          wallet: walletRes.data,
          currentCycle: cycleRes.data,
        });
      }
    } catch (err) {
      console.error("Error fetching group details:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (membershipId: string, userId: string, memberName: string) => {
    setRemovingMember(membershipId);
    try {
      const { error } = await supabase
        .from("group_memberships")
        .update({ status: "removed" as any })
        .eq("id", membershipId);

      if (error) throw error;

      await supabase.from("audit_logs").insert({
        user_id: userId,
        action: "admin_remove_member",
        resource_type: "group",
        resource_id: groupId,
        details: { member_name: memberName },
      });

      toast({ title: "Member Removed", description: `${memberName} has been removed from the group.` });
      fetchData();
      onRefresh();
    } catch (err) {
      console.error("Error removing member:", err);
      toast({ title: "Error", description: "Failed to remove member.", variant: "destructive" });
    } finally {
      setRemovingMember(null);
    }
  };

  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={9} className="p-4 bg-muted/30">
          <Skeleton className="h-16 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={9} className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Members Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Members ({data?.members.length || 0})
            </h4>
            {data?.members && data.members.length > 0 ? (
              <div className="text-sm space-y-1 max-h-48 overflow-y-auto">
                {data.members.map((membership: any) => {
                  const name = membership.profiles?.full_name || membership.profiles?.email || "Unknown";
                  return (
                    <div key={membership.id} className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate">{name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          Pos {membership.payout_position || "—"}
                        </Badge>
                        {Number(membership.outstanding_owed || 0) > 0 && (
                          <Badge variant="destructive" className="text-xs shrink-0">
                            Owes ₦{Number(membership.outstanding_owed).toLocaleString()}
                          </Badge>
                        )}
                      </div>

                      {hasPermission("groups.resolve_disputes") && membership.status === "active" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                          disabled={removingMember === membership.id}
                          onClick={() => handleRemoveMember(membership.id, membership.user_id, name)}
                          title="Remove member"
                        >
                          <UserMinus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No members</p>
            )}
          </div>

          {/* Wallet Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Group Wallet
            </h4>
            {data?.wallet ? (
              <div className="text-sm space-y-1">
                <p>Balance: <span className="font-medium">₦{(data.wallet.contribution_balance || 0).toLocaleString()}</span></p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No wallet data</p>
            )}
          </div>

          {/* Current Cycle Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Current Cycle
            </h4>
            {data?.currentCycle ? (
              <div className="text-sm space-y-1">
                <p>Cycle: <span className="font-medium">#{data.currentCycle.cycle_number}</span></p>
                <p>Status: <Badge variant="outline" className="text-xs capitalize">{data.currentCycle.status}</Badge></p>
                {data.currentCycle.contribution_deadline && (
                  <p>Deadline: <span className="font-medium">{format(new Date(data.currentCycle.contribution_deadline), "MMM d, yyyy")}</span></p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active cycle</p>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function GroupManagementTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [actionDialog, setActionDialog] = useState<{ group: any; action: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [triggeringGroup, setTriggeringGroup] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { groups, loading, refetch } = useAdminGroups();
  const { hasPermission } = useAdminPermissions();
  const { toast } = useToast();

  const handleTriggerAutoContribution = async (groupId: string, groupName: string) => {
    setTriggeringGroup(groupId);
    try {
      const { data, error } = await supabase.functions.invoke("auto-contribution", {
        body: { force_group_id: groupId },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: "Auto-Contribution Triggered", description: `Successfully triggered for "${groupName}". ${data.results?.length || 0} group(s) processed.` });
      } else {
        toast({ title: "Trigger Failed", description: data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      console.error("Trigger error:", err);
      toast({ title: "Error", description: err.message || "Failed to trigger auto-contribution.", variant: "destructive" });
    } finally {
      setTriggeringGroup(null);
    }
  };

  // Real-time: auto-refresh groups when either legacy or sandbox tables change
  useEffect(() => {
    const channel = supabase
      .channel("admin-groups-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "thrift_groups" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "group_memberships" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "group_wallets" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "vfd_sandbox_groups" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "vfd_sandbox_group_members" }, () => refetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const filteredGroups = groups.filter(group => {
    const searchLower = search.toLowerCase();
    return (
      group.name?.toLowerCase().includes(searchLower) ||
      group.admin_name?.toLowerCase().includes(searchLower) ||
      group.id.toLowerCase().includes(searchLower)
    );
  });

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleGroupAction = async () => {
    if (!actionDialog) return;
    setActionLoading(true);
    const { group, action } = actionDialog;

    try {
      let newStatus: string | null = null;

      switch (action) {
        case "suspend":
          newStatus = "paused";
          break;
        case "unsuspend":
          newStatus = "active";
          break;
        case "delete":
          // Delete all memberships, then the group
          await supabase.from("group_memberships").delete().eq("group_id", group.id);
          await supabase.from("group_wallets").delete().eq("group_id", group.id);
          const { error: deleteErr } = await supabase.from("thrift_groups").delete().eq("id", group.id);
          if (deleteErr) throw deleteErr;
          break;
      }

      if (newStatus) {
        const { error } = await supabase
          .from("thrift_groups")
          .update({ status: newStatus as any })
          .eq("id", group.id);
        if (error) throw error;
      }

      // Log the action
      await supabase.from("audit_logs").insert({
        user_id: group.admin_id,
        action: `admin_group_${action}`,
        resource_type: "group",
        resource_id: group.id,
        details: { group_name: group.name, reason: reason.trim() || null },
      });

      toast({ title: "Success", description: `Group "${group.name}" has been ${action === "delete" ? "deleted" : action === "suspend" ? "suspended" : "unsuspended"}.` });
      setActionDialog(null);
      setReason("");
      refetch();
    } catch (err) {
      console.error("Group action error:", err);
      toast({ title: "Error", description: "Failed to perform action.", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const getAvailableActions = (status: string) => {
    const actions: { key: string; label: string; icon: any; variant: "ghost" | "destructive" | "outline" }[] = [];
    if (hasPermission("groups.pause")) {
      if (status === "active") {
        actions.push({ key: "suspend", label: "Suspend", icon: Pause, variant: "outline" });
      }
      if (status === "paused") {
        actions.push({ key: "unsuspend", label: "Unsuspend", icon: Play, variant: "outline" });
      }
    }
    if (hasPermission("groups.resolve_disputes")) {
      actions.push({ key: "delete", label: "Delete", icon: Trash2, variant: "destructive" });
    }
    return actions;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Group Management</CardTitle>
              <CardDescription>View and manage all thrift groups. Click a row to expand details.</CardDescription>
            </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name or admin..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" disabled={!filteredGroups.length} onClick={() => {
              exportToCSV(filteredGroups.map(g => ({
                Name: g.name,
                Source: g.source || "legacy",
                Admin: g.admin_name || "",
                Status: g.status,
                Members: g.member_count,
                Contribution: g.contribution_amount,
                Period: g.period,
                Created: g.created_at ? format(new Date(g.created_at), "yyyy-MM-dd") : "",
              })), "groups");
            }}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filteredGroups.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No groups found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Group Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Contribution</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => (
                    <>
                      <TableRow key={`${group.source || "legacy"}-${group.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpanded(group.id)}>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            {expandedGroups.has(group.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">{group.source || "legacy"}</Badge>
                        </TableCell>
                        <TableCell>{group.admin_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={group.status === "active" ? "default" : group.status === "paused" ? "destructive" : "secondary"} className="capitalize">
                            {group.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{group.member_count}</TableCell>
                        <TableCell>₦{group.contribution_amount.toLocaleString()}</TableCell>
                        <TableCell className="capitalize">{group.period}</TableCell>
                        <TableCell className="text-muted-foreground">{group.created_at ? format(new Date(group.created_at), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/groups/${group.id}`)}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            {group.source !== "sandbox" && group.status === "active" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Trigger Auto-Contribution"
                                disabled={triggeringGroup === group.id}
                                onClick={() => handleTriggerAutoContribution(group.id, group.name)}
                              >
                                {triggeringGroup === group.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Zap className="h-4 w-4 text-warning" />
                                )}
                              </Button>
                            )}
                            {group.source !== "sandbox" && getAvailableActions(group.status).map(({ key, label, icon: Icon, variant }) => (
                              <Button
                                key={key}
                                variant={variant === "destructive" ? "ghost" : "ghost"}
                                size="sm"
                                className={variant === "destructive" ? "text-destructive hover:text-destructive" : ""}
                                onClick={() => setActionDialog({ group, action: key })}
                                title={label}
                              >
                                <Icon className="h-4 w-4" />
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedGroups.has(group.id) && (
                        <GroupDetailsRow key={`${group.id}-details`} groupId={group.id} source={group.source} onRefresh={refetch} />
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Confirmation Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) { setActionDialog(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{actionDialog?.action} Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to {actionDialog?.action} "{actionDialog?.group.name}"?
              {actionDialog?.action === "delete" && " This action cannot be undone and will remove all members and data."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Input placeholder="Enter reason..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setReason(""); }}>Cancel</Button>
            <Button
              variant={actionDialog?.action === "delete" ? "destructive" : "default"}
              onClick={handleGroupAction}
              disabled={actionLoading}
            >
              {actionLoading ? "Processing..." : `Confirm ${actionDialog?.action}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
