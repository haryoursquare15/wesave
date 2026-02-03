import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin, useAdminStats, useAdminUsers, useAdminGroups, useAdminRoles } from "@/hooks/useAdmin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users, UsersRound, Activity, Wallet, Shield, ArrowLeft, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export default function Admin() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { stats, loading: statsLoading, refetch: refetchStats } = useAdminStats();
  const { users, loading: usersLoading, refetch: refetchUsers } = useAdminUsers();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useAdminGroups();
  const { assignRole, removeRole, loading: roleLoading } = useAdminRoles();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!adminLoading && !isAdmin && user) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      navigate("/dashboard");
    }
  }, [isAdmin, adminLoading, user, navigate, toast]);

  const handleRoleChange = async (userId: string, newRole: string, currentRole: string | null) => {
    try {
      // Remove old role if exists
      if (currentRole) {
        await removeRole(userId, currentRole as "admin" | "moderator" | "user");
      }
      // Assign new role if not "none"
      if (newRole !== "none") {
        await assignRole(userId, newRole as "admin" | "moderator" | "user");
      }
      toast({
        title: "Role Updated",
        description: "User role has been updated successfully.",
      });
      refetchUsers();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update user role.",
        variant: "destructive",
      });
    }
  };

  const handleRefreshAll = () => {
    refetchStats();
    refetchUsers();
    refetchGroups();
    toast({ title: "Refreshed", description: "Data has been refreshed." });
  };

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            </div>
          </div>
          <Button variant="outline" onClick={handleRefreshAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats?.total_users || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Groups</CardTitle>
              <UsersRound className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats?.total_groups || 0}</div>
              )}
              <p className="text-xs text-muted-foreground">
                {stats?.active_groups || 0} active, {stats?.pending_groups || 0} pending
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats?.total_transactions || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  ₦{(stats?.total_volume || 0).toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Users and Groups */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>Manage user accounts and roles</CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Username</TableHead>
                          <TableHead>Tier</TableHead>
                          <TableHead>Credit Score</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">
                              {user.full_name || "—"}
                            </TableCell>
                            <TableCell>{user.email || "—"}</TableCell>
                            <TableCell>{user.username || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {user.membership_tier}
                              </Badge>
                            </TableCell>
                            <TableCell>{user.credit_score || 0}</TableCell>
                            <TableCell>
                              <Select
                                value={user.role || "none"}
                                onValueChange={(value) => handleRoleChange(user.id, value, user.role)}
                                disabled={roleLoading}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No Role</SelectItem>
                                  <SelectItem value="user">User</SelectItem>
                                  <SelectItem value="moderator">Moderator</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {user.created_at
                                ? format(new Date(user.created_at), "MMM d, yyyy")
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="groups">
            <Card>
              <CardHeader>
                <CardTitle>All Groups</CardTitle>
                <CardDescription>View and manage all thrift groups</CardDescription>
              </CardHeader>
              <CardContent>
                {groupsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Group Name</TableHead>
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
                        {groups.map((group) => (
                          <TableRow key={group.id}>
                            <TableCell className="font-medium">{group.name}</TableCell>
                            <TableCell>{group.admin_name || "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  group.status === "active"
                                    ? "default"
                                    : group.status === "completed"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="capitalize"
                              >
                                {group.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{group.member_count}</TableCell>
                            <TableCell>₦{group.contribution_amount.toLocaleString()}</TableCell>
                            <TableCell className="capitalize">{group.period}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {group.created_at
                                ? format(new Date(group.created_at), "MMM d, yyyy")
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/groups/${group.id}`)}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
