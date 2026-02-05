import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin, useAdminGroups } from "@/hooks/useAdmin";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, ArrowLeft, RefreshCw, Banknote, Users, UsersRound, 
  Activity, TicketCheck, AlertTriangle, FileText 
} from "lucide-react";
import { format } from "date-fns";
import { PlatformRevenueTab } from "@/components/admin/PlatformRevenueTab";
import { AdminOverviewTab } from "@/components/admin/AdminOverviewTab";
import { UserManagementTab } from "@/components/admin/UserManagementTab";
import { TransactionExplorerTab } from "@/components/admin/TransactionExplorerTab";
import { AuditLogsTab } from "@/components/admin/AuditLogsTab";

export default function Admin() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { hasPermission, loading: permLoading } = useAdminPermissions();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useAdminGroups();
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
  }, [isAdmin, adminLoading, permLoading, user, navigate, toast]);

  if (authLoading || adminLoading || permLoading) {
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
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs for different admin sections */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="flex items-center gap-1">
              <Activity className="h-4 w-4" />
              Overview
            </TabsTrigger>
            {hasPermission("users.view") && (
              <TabsTrigger value="users" className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
            )}
            {hasPermission("groups.view") && (
              <TabsTrigger value="groups" className="flex items-center gap-1">
                <UsersRound className="h-4 w-4" />
                Groups
              </TabsTrigger>
            )}
            {hasPermission("transactions.view") && (
              <TabsTrigger value="transactions" className="flex items-center gap-1">
                <Activity className="h-4 w-4" />
                Transactions
              </TabsTrigger>
            )}
            {hasPermission("revenue.view") && (
              <TabsTrigger value="revenue" className="flex items-center gap-1">
              <Banknote className="h-4 w-4" />
              Platform Revenue
              </TabsTrigger>
            )}
            {hasPermission("audit.view") && (
              <TabsTrigger value="audit" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Audit Logs
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview">
            <AdminOverviewTab />
          </TabsContent>

          <TabsContent value="users">
            <UserManagementTab />
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

          <TabsContent value="transactions">
            <TransactionExplorerTab />
          </TabsContent>

          <TabsContent value="revenue">
            <PlatformRevenueTab />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
