import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAdminUsers, useAdminRoles } from "@/hooks/useAdmin";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Search, Snowflake, AlertTriangle, Shield, ChevronDown, ChevronRight, Wallet, Users, Trash2, UserX, Download, KeyRound, Copy } from "lucide-react";
import { exportToCSV } from "@/lib/exportUtils";
import { adminActionReasonSchema, validateInput } from "@/lib/validation";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserActionsDialogProps {
  user: {
    id: string;
    email: string | null;
    full_name: string | null;
    username: string | null;
  };
  onClose: () => void;
  onAction: () => void;
}

function UserActionsDialog({ user, onClose, onAction }: UserActionsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const { toast } = useToast();
  const { hasPermission } = useAdminPermissions();

  const handleAction = async () => {
    if (!action) return;
    
    if (reason) {
      const validation = validateInput(adminActionReasonSchema, reason);
      if (validation.success === false) {
        toast({ title: "Validation Error", description: validation.error, variant: "destructive" });
        return;
      }
    }
    
    setLoading(true);
    
    try {
      const sanitizedReason = reason.trim().slice(0, 500);
      
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: `admin_${action}`,
        resource_type: "user",
        resource_id: user.id,
        details: { reason: sanitizedReason, target_email: user.email },
      });

      switch (action) {
        case "freeze":
          await supabase.from("profiles").update({
            account_status: "frozen",
            frozen_at: new Date().toISOString(),
            freeze_reason: sanitizedReason,
          }).eq("id", user.id);
          toast({ title: "User Frozen", description: `${user.full_name || user.email}'s account has been frozen.` });
          break;
        case "unfreeze":
          await supabase.from("profiles").update({
            account_status: "active",
            frozen_at: null,
            frozen_by: null,
            freeze_reason: null,
          }).eq("id", user.id);
          toast({ title: "User Unfrozen", description: `${user.full_name || user.email}'s account has been unfrozen.` });
          break;
        case "flag_risk":
          await supabase.from("profiles").update({ risk_level: "high" }).eq("id", user.id);
          toast({ title: "User Flagged", description: `${user.full_name || user.email} has been flagged for risk review.` });
          break;
        case "clear_risk":
          await supabase.from("profiles").update({ risk_level: "low" }).eq("id", user.id);
          toast({ title: "Risk Cleared", description: `${user.full_name || user.email}'s risk flag has been cleared.` });
          break;
        case "remove_from_groups":
          await supabase.from("group_memberships")
            .update({ status: "removed" as any })
            .eq("user_id", user.id)
            .eq("status", "active");
          toast({ title: "Removed from Groups", description: `${user.full_name || user.email} has been removed from all active groups.` });
          break;
        case "suspend":
          await supabase.from("profiles").update({
            account_status: "suspended",
            frozen_at: new Date().toISOString(),
            freeze_reason: sanitizedReason || "Suspended by admin",
          }).eq("id", user.id);
          toast({ title: "User Suspended", description: `${user.full_name || user.email}'s account has been suspended.` });
          break;
        case "set_temp_password": {
          if (!tempPassword || tempPassword.length < 8) {
            toast({ title: "Invalid password", description: "Min 8 characters.", variant: "destructive" });
            setLoading(false);
            return;
          }
          const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
            body: { target_user_id: user.id, mode: "set_temp_password", new_password: tempPassword },
          });
          if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
          toast({ title: "Password Reset", description: `Temporary password set for ${user.email}. Share it securely.` });
          break;
        }
        case "send_recovery_link": {
          const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
            body: { target_user_id: user.id, mode: "send_recovery_link" },
          });
          if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
          setRecoveryLink((data as any)?.action_link || null);
          toast({ title: "Recovery link generated", description: "Copy and share it with the user." });
          setLoading(false);
          return;
        }
        default:
          break;
      }

      onAction();
      onClose();
    } catch (err) {
      console.error("Action error:", err);
      toast({ title: "Error", description: "Failed to perform action.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>User Actions</DialogTitle>
        <DialogDescription>
          Manage {user.full_name || user.email}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-2">
          {hasPermission("users.freeze") && (
            <>
              <Button variant={action === "freeze" ? "default" : "outline"} size="sm" onClick={() => setAction("freeze")} className="flex items-center gap-2">
                <Snowflake className="h-4 w-4" /> Freeze Account
              </Button>
              <Button variant={action === "unfreeze" ? "default" : "outline"} size="sm" onClick={() => setAction("unfreeze")} className="flex items-center gap-2">
                <Snowflake className="h-4 w-4" /> Unfreeze
              </Button>
            </>
          )}
          {hasPermission("users.freeze") && (
            <Button variant={action === "suspend" ? "destructive" : "outline"} size="sm" onClick={() => setAction("suspend")} className="flex items-center gap-2">
              <UserX className="h-4 w-4" /> Suspend User
            </Button>
          )}
          {hasPermission("compliance.restrict") && (
            <>
              <Button variant={action === "flag_risk" ? "destructive" : "outline"} size="sm" onClick={() => setAction("flag_risk")} className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Flag for Risk
              </Button>
              <Button variant={action === "clear_risk" ? "default" : "outline"} size="sm" onClick={() => setAction("clear_risk")} className="flex items-center gap-2">
                <Shield className="h-4 w-4" /> Clear Risk Flag
              </Button>
            </>
          )}
          {hasPermission("groups.resolve_disputes") && (
            <Button variant={action === "remove_from_groups" ? "destructive" : "outline"} size="sm" onClick={() => setAction("remove_from_groups")} className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Remove from All Groups
            </Button>
          )}
        </div>

        {action && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Input placeholder="Enter reason for this action..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          variant={["flag_risk", "suspend", "remove_from_groups"].includes(action || "") ? "destructive" : "default"}
          onClick={handleAction}
          disabled={!action || loading}
        >
          {loading ? "Processing..." : "Confirm Action"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface UserDetailsRowProps {
  userId: string;
}

function UserDetailsRow({ userId }: UserDetailsRowProps) {
  const [data, setData] = useState<{ wallet: any; groups: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [walletRes, groupsRes] = await Promise.all([
          supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("group_memberships")
            .select("*, thrift_groups(name, status, contribution_amount)")
            .eq("user_id", userId)
        ]);
        setData({ wallet: walletRes.data, groups: groupsRes.data || [] });
      } catch (err) {
        console.error("Error fetching user details:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="p-4 bg-muted/30"><Skeleton className="h-16 w-full" /></TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={8} className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2"><Wallet className="h-4 w-4" /> Wallet</h4>
            {data?.wallet ? (
              <div className="text-sm space-y-1">
                <p>Available: <span className="font-medium">₦{(data.wallet.available_balance || 0).toLocaleString()}</span></p>
                <p>Locked: <span className="font-medium">₦{(data.wallet.locked_balance || 0).toLocaleString()}</span></p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No wallet found</p>
            )}
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Groups ({data?.groups.length || 0})</h4>
            {data?.groups && data.groups.length > 0 ? (
              <div className="text-sm space-y-1 max-h-32 overflow-y-auto">
                {data.groups.map((membership: any) => (
                  <div key={membership.id} className="flex justify-between items-center">
                    <span>{membership.thrift_groups?.name || "Unknown"}</span>
                    <Badge variant="outline" className="text-xs capitalize">{membership.thrift_groups?.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not in any groups</p>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function UserManagementTab() {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const { users, loading, refetch } = useAdminUsers();
  const { assignRole, removeRole, loading: roleLoading } = useAdminRoles();
  const { hasPermission } = useAdminPermissions();
  const { toast } = useToast();

  // Real-time: auto-refresh user list when profiles or wallets change
  useEffect(() => {
    const channel = supabase
      .channel("admin-users-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets" }, () => {
        refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_memberships" }, () => {
        refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const filteredUsers = users.filter(user => {
    const searchLower = search.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.username?.toLowerCase().includes(searchLower) ||
      user.id.toLowerCase().includes(searchLower)
    );
  });

  const toggleExpanded = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleRoleChange = async (userId: string, newRole: string, currentRole: string | null) => {
    if (!hasPermission("roles.manage")) {
      toast({ title: "Permission Denied", variant: "destructive" });
      return;
    }
    try {
      if (currentRole) await removeRole(userId, currentRole as AppRole);
      if (newRole !== "none") await assignRole(userId, newRole as AppRole);
      toast({ title: "Role Updated", description: "User role has been updated successfully." });
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "Failed to update user role.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>Search and manage user accounts. Click a row to expand details.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, email, username..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" disabled={!filteredUsers.length} onClick={() => {
              exportToCSV(filteredUsers.map(u => ({
                Name: u.full_name || "",
                Username: u.username || "",
                Email: u.email || "",
                Tier: u.membership_tier,
                "Credit Score": u.credit_score || 0,
                Role: u.role || "none",
                Joined: u.created_at ? format(new Date(u.created_at), "yyyy-MM-dd") : "",
              })), "users");
            }}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Credit Score</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <>
                    <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpanded(user.id)}>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {expandedUsers.has(user.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>@{user.username || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{user.membership_tier}</Badge></TableCell>
                      <TableCell>{user.credit_score || 0}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {hasPermission("roles.manage") ? (
                          <Select value={user.role || "none"} onValueChange={(value) => handleRoleChange(user.id, value, user.role)} disabled={roleLoading}>
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Role</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="moderator">Moderator</SelectItem>
                              <SelectItem value="support_officer">Support Officer</SelectItem>
                              <SelectItem value="finance_admin">Finance Admin</SelectItem>
                              <SelectItem value="operations_admin">Operations Admin</SelectItem>
                              <SelectItem value="compliance_admin">Compliance Admin</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="super_admin">Super Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary" className="capitalize">{user.role || "none"}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedUser(user)}>
                              <Shield className="h-4 w-4 mr-1" /> Actions
                            </Button>
                          </DialogTrigger>
                          {selectedUser?.id === user.id && (
                            <UserActionsDialog user={user} onClose={() => setSelectedUser(null)} onAction={refetch} />
                          )}
                        </Dialog>
                      </TableCell>
                    </TableRow>
                    {expandedUsers.has(user.id) && (
                      <UserDetailsRow key={`${user.id}-details`} userId={user.id} />
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
