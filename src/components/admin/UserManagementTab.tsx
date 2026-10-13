import { useState, useEffect, useCallback } from "react";
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
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// LEGACY (WeSave decommission): this file still queries dropped tables/RPCs.
// Kept as dead code pending a dedicated frontend cleanup pass.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;
import { format } from "date-fns";
import { Search, Snowflake, AlertTriangle, Shield, ChevronDown, ChevronRight, Wallet, Users, Trash2, UserX, Download, KeyRound, Copy } from "lucide-react";
import { exportToCSV } from "@/lib/exportUtils";
import { adminActionReasonSchema, validateInput } from "@/lib/validation";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AccountStatusInfo { id: string; account_status: string | null; risk_level: string | null; frozen_at: string | null; freeze_reason: string | null; }

function StatusBadge({ info }: { info?: AccountStatusInfo }) {
  const st = info?.account_status ?? "active";
  const since = info?.frozen_at ? format(new Date(info.frozen_at), "MMM d") : null;
  const title = info?.freeze_reason || undefined;
  if (st === "frozen") return <Badge title={title} className="bg-primary/10 text-primary border-primary/30 gap-1" variant="outline"><Snowflake className="h-3 w-3" /> Frozen{since ? ` · ${since}` : ""}</Badge>;
  if (st === "suspended") return <Badge title={title} variant="destructive" className="gap-1"><UserX className="h-3 w-3" /> Suspended{since ? ` · ${since}` : ""}</Badge>;
  if (info?.risk_level === "high") return <Badge variant="outline" className="border-destructive/40 text-destructive gap-1"><AlertTriangle className="h-3 w-3" /> Risk flagged</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Active</Badge>;
}

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
      
      const RPC_ACTIONS: Record<string, string> = {
        freeze: "Wallet frozen — payments, transfers and withdrawals are now blocked.",
        unfreeze: "Account restored — the customer can move money again.",
        suspend: "Account suspended — all money movement is blocked.",
        flag_risk: "Flagged — transfers and withdrawals are paused for review.",
        clear_risk: "Risk flag cleared — transfers and withdrawals restored.",
        remove_from_groups: "",
      };

      switch (action) {
        case "freeze": case "unfreeze": case "suspend": case "flag_risk": case "clear_risk": case "remove_from_groups": {
          const { data, error } = await supabase.rpc("admin_account_action", {
            _user_id: user.id, _action: action, _reason: sanitizedReason || null,
          });
          if (error) throw error;
          const affected = Number((data as any)?.affected ?? 0);
          const desc = action === "remove_from_groups"
            ? (affected ? `Removed from ${affected} group(s) that had not started. Running groups are untouched to protect payouts.` : "No unstarted groups to remove from. Running groups are untouched to protect payouts.")
            : RPC_ACTIONS[action];
          toast({ title: user.full_name || user.email || "User updated", description: desc });
          break;
        }
        case "set_temp_password": {
          if (!tempPassword || tempPassword.length < 8) {
            toast({ title: "Invalid password", description: "Min 8 characters.", variant: "destructive" });
            setLoading(false);
            return;
          }
          const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
            body: { target_user_id: user.id, mode: "set_temp_password", new_password: tempPassword },
          });
          const errMsg = (data as any)?.error || error?.message;
          if (errMsg) {
            toast({ title: "Password rejected", description: errMsg, variant: "destructive" });
            setLoading(false);
            return;
          }
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
          <Button variant={action === "set_temp_password" ? "default" : "outline"} size="sm" onClick={() => { setAction("set_temp_password"); setRecoveryLink(null); }} className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Set Temp Password
          </Button>
          <Button variant={action === "send_recovery_link" ? "default" : "outline"} size="sm" onClick={() => { setAction("send_recovery_link"); setRecoveryLink(null); }} className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Generate Recovery Link
          </Button>
        </div>

        {action === "set_temp_password" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">New temporary password (min 8 chars, not common)</label>
            <div className="flex gap-2">
              <Input type="text" placeholder="Click Generate for a strong password" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
                  const symbols = "!@#$%&*";
                  let pwd = "";
                  const arr = new Uint32Array(14);
                  crypto.getRandomValues(arr);
                  for (let i = 0; i < 14; i++) pwd += chars[arr[i] % chars.length];
                  pwd += symbols[Math.floor(Math.random() * symbols.length)];
                  setTempPassword(pwd);
                }}
              >
                Generate
              </Button>
              {tempPassword && (
                <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(tempPassword); toast({ title: "Copied" }); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Avoid common words/dates (e.g. "password123", "Vestara2024"). The system rejects leaked or weak passwords. Share securely; user should change after sign-in.
            </p>
          </div>
        )}

        {recoveryLink && (
          <div className="space-y-2 p-3 rounded bg-muted">
            <label className="text-sm font-medium">Recovery link (single-use)</label>
            <div className="flex gap-2">
              <Input readOnly value={recoveryLink} className="text-xs" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(recoveryLink); toast({ title: "Copied" }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {action && action !== "set_temp_password" && action !== "send_recovery_link" && (
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
        const [balRes, legacyWalletRes, groupsRes] = await Promise.all([
          supabase.from("vfd_user_balances").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("vfd_sandbox_group_members")
            .select("id, status, vfd_sandbox_groups(name, status, contribution_amount)")
            .eq("user_id", userId)
        ]);
        setData({
          wallet: balRes.data || legacyWalletRes.data || null,
          groups: groupsRes.data || [],
        });
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
        <TableCell colSpan={9} className="p-4 bg-muted/30"><Skeleton className="h-16 w-full" /></TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={9} className="p-4">
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
                    <span>{membership.vfd_sandbox_groups?.name || "Unknown"}</span>
                    <Badge variant="outline" className="text-xs capitalize">{membership.vfd_sandbox_groups?.status}</Badge>
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
  const [statuses, setStatuses] = useState<Record<string, AccountStatusInfo>>({});
  const [statusFilter, setStatusFilter] = useState("all");

  const loadStatuses = useCallback(async () => {
    const { data } = await supabase.rpc("admin_list_account_statuses");
    const map: Record<string, AccountStatusInfo> = {};
    (data ?? []).forEach((r: any) => { map[r.id] = r; });
    setStatuses(map);
  }, []);
  useEffect(() => { loadStatuses(); }, [loadStatuses, users]);

  // Real-time: auto-refresh user list when profiles or wallets change
  useEffect(() => {
    const channel = supabase
      .channel("admin-users-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "vfd_user_balances" }, () => {
        refetch();
      })

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const statusOf = (id: string) => {
    const st = statuses[id];
    if (st?.account_status === "frozen" || st?.account_status === "suspended") return st.account_status;
    if (st?.risk_level === "high") return "flagged";
    return "active";
  };
  const counts = users.reduce((acc, u) => { const k = statusOf(u.id); acc[k] = (acc[k] || 0) + 1; return acc; }, {} as Record<string, number>);

  const filteredUsers = users.filter(user => {
    if (statusFilter !== "all" && statusOf(user.id) !== statusFilter) return false;
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {[
            { k: "all", label: "All users", n: users.length },
            { k: "active", label: "Active", n: counts.active || 0 },
            { k: "frozen", label: "Frozen", n: counts.frozen || 0 },
            { k: "suspended", label: "Suspended", n: counts.suspended || 0 },
            { k: "flagged", label: "Risk flagged", n: counts.flagged || 0 },
          ].map((c) => (
            <button key={c.k} onClick={() => setStatusFilter(c.k)}
              className={`text-left rounded-xl border p-3 transition-colors ${statusFilter === c.k ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="text-xl font-semibold text-foreground">{c.n}</div>
            </button>
          ))}
        </div>
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
                  <TableHead>Status</TableHead>
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
                      <TableCell><StatusBadge info={statuses[user.id]} /></TableCell>
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
                            <UserActionsDialog user={user} onClose={() => setSelectedUser(null)} onAction={() => { refetch(); loadStatuses(); }} />
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
