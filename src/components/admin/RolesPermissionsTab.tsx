import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAdminPermissions, AdminRole, Permission } from "@/hooks/useAdminPermissions";
import { Shield, UserPlus, X, Search, Loader2 } from "lucide-react";

const ROLES: AdminRole[] = [
  "super_admin",
  "admin",
  "operations_admin",
  "finance_admin",
  "support_officer",
  "compliance_admin",
];

const ALL_PERMISSIONS: Permission[] = [
  "users.view","users.edit","users.freeze","users.reset_2fa",
  "wallets.view","wallets.freeze",
  "groups.view","groups.pause","groups.resolve_disputes",
  "associations.view","associations.manage",
  "crowdfunding.view","crowdfunding.manage",
  "transactions.view","transactions.retry",
  "revenue.view","revenue.settle",
  "requests.view","requests.approve",
  "support.view","support.resolve",
  "compliance.view","compliance.restrict",
  "analytics.view","analytics.export",
  "audit.view","roles.manage",
];

interface StaffRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  roles: AdminRole[];
  created_at: string;
}

export function RolesPermissionsTab() {
  const { hasPermission, userRoles } = useAdminPermissions();
  const isSuperAdmin = userRoles.includes("super_admin");
  const canManage = hasPermission("roles.manage") && isSuperAdmin;
  const { toast } = useToast();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Assign-staff form
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("support_officer");

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_staff");
    if (error) toast({ title: "Failed to load staff", description: error.message, variant: "destructive" });
    setStaff((data as StaffRow[]) || []);
    setLoading(false);
  }, [toast]);

  const fetchMatrix = useCallback(async () => {
    setMatrixLoading(true);
    const { data, error } = await supabase.from("admin_permissions").select("role, permission");
    if (error) toast({ title: "Failed to load permissions", description: error.message, variant: "destructive" });
    const m: Record<string, Set<string>> = {};
    (data || []).forEach((row: any) => {
      m[row.role] = m[row.role] || new Set();
      m[row.role].add(row.permission);
    });
    setMatrix(m);
    setMatrixLoading(false);
  }, [toast]);

  useEffect(() => { fetchStaff(); fetchMatrix(); }, [fetchStaff, fetchMatrix]);

  const togglePermission = async (role: AdminRole, permission: Permission, checked: boolean) => {
    if (!canManage) return;
    const key = `${role}:${permission}`;
    setBusy(key);
    const rpc = checked ? "admin_grant_permission" : "admin_revoke_permission";
    const { error } = await supabase.rpc(rpc, { _role: role, _permission: permission });
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setMatrix((prev) => {
        const next = { ...prev };
        const set = new Set(next[role] || []);
        if (checked) set.add(permission); else set.delete(permission);
        next[role] = set;
        return next;
      });
    }
    setBusy(null);
  };

  const assignRole = async (userId: string, role: AdminRole) => {
    setBusy(`assign:${userId}:${role}`);
    const { error } = await supabase.rpc("admin_assign_role", { _user_id: userId, _role: role });
    if (error) toast({ title: "Assign failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Role assigned" }); fetchStaff(); }
    setBusy(null);
  };

  const removeRole = async (userId: string, role: AdminRole) => {
    setBusy(`remove:${userId}:${role}`);
    const { error } = await supabase.rpc("admin_remove_role", { _user_id: userId, _role: role });
    if (error) toast({ title: "Remove failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Role removed" }); fetchStaff(); }
    setBusy(null);
  };

  const addNewStaff = async () => {
    if (!newEmail.trim()) return;
    setBusy("add-new");
    // Look up user by email via profiles
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("id, email")
      .ilike("email", newEmail.trim())
      .maybeSingle();
    if (pErr || !prof) {
      toast({ title: "User not found", description: "The user must have a Vestara account first.", variant: "destructive" });
      setBusy(null);
      return;
    }
    const { error } = await supabase.rpc("admin_assign_role", { _user_id: prof.id, _role: newRole });
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Staff added" }); setNewEmail(""); fetchStaff(); }
    setBusy(null);
  };

  if (!hasPermission("roles.manage")) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
          You don't have permission to manage roles.
        </CardContent>
      </Card>
    );
  }

  const filteredStaff = staff.filter((s) =>
    !search.trim() ||
    (s.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.full_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Tabs defaultValue="staff" className="space-y-4">
      <TabsList>
        <TabsTrigger value="staff">Staff & Roles</TabsTrigger>
        <TabsTrigger value="matrix">Permissions Matrix</TabsTrigger>
      </TabsList>

      <TabsContent value="staff" className="space-y-4">
        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add Staff</CardTitle>
              <CardDescription>Grant a role to an existing Vestara user by email.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="user@vestara.ng"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={newRole} onValueChange={(v) => setNewRole(v as AdminRole)}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={addNewStaff} disabled={busy === "add-new" || !newEmail.trim()}>
                {busy === "add-new" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="text-base">Staff ({staff.length})</CardTitle>
                <CardDescription>All users with admin or staff roles.</CardDescription>
              </div>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by email or name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              [1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : filteredStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No staff found.</p>
            ) : (
              filteredStaff.map((s) => (
                <div key={s.user_id} className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.full_name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="gap-1">
                          {r.replace(/_/g, " ")}
                          {canManage && (
                            <button
                              onClick={() => removeRole(s.user_id, r)}
                              disabled={busy === `remove:${s.user_id}:${r}`}
                              className="ml-1 hover:text-destructive"
                              aria-label={`Remove ${r}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {canManage && (
                    <Select onValueChange={(v) => assignRole(s.user_id, v as AdminRole)}>
                      <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Add role" /></SelectTrigger>
                      <SelectContent>
                        {ROLES.filter((r) => !s.roles.includes(r)).map((r) => (
                          <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="matrix">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permissions Matrix</CardTitle>
            <CardDescription>
              {canManage
                ? "Toggle which areas each role can access. Changes apply immediately."
                : "Read-only view — only super_admin can edit."}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {matrixLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-2 sticky left-0 bg-card">Permission</th>
                    {ROLES.map((r) => (
                      <th key={r} className="p-2 text-center min-w-[110px] capitalize">{r.replace(/_/g, " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PERMISSIONS.map((perm) => (
                    <tr key={perm} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs sticky left-0 bg-card">{perm}</td>
                      {ROLES.map((r) => {
                        const enabled = matrix[r]?.has(perm) ?? false;
                        const isBusy = busy === `${r}:${perm}`;
                        return (
                          <td key={r} className="p-2 text-center">
                            {isBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                            ) : (
                              <Checkbox
                                checked={enabled}
                                disabled={!canManage}
                                onCheckedChange={(c) => togglePermission(r, perm, Boolean(c))}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
