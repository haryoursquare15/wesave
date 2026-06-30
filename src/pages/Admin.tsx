import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, ArrowLeft, Banknote, Users, UsersRound, 
  Activity, FileText, FlaskConical, CreditCard, ArrowDownToLine, Wallet, MessageSquare, Mail
} from "lucide-react";
import { PlatformRevenueTab } from "@/components/admin/PlatformRevenueTab";
import { AdminOverviewTab } from "@/components/admin/AdminOverviewTab";
import { UserManagementTab } from "@/components/admin/UserManagementTab";
import { GroupManagementTab } from "@/components/admin/GroupManagementTab";
import { TransactionExplorerTab } from "@/components/admin/TransactionExplorerTab";
import { AuditLogsTab } from "@/components/admin/AuditLogsTab";
import { ContributionsTab } from "@/components/admin/ContributionsTab";
import { PaymentAuthTab } from "@/components/admin/PaymentAuthTab";
import { WithdrawalsTab } from "@/components/admin/WithdrawalsTab";
import { SupportTab } from "@/components/admin/SupportTab";
import { AdminEmailTab } from "@/components/admin/AdminEmailTab";
import { VestaraRateConfigTab } from "@/components/admin/VestaraRateConfigTab";
import { VestaraInvestmentsTab } from "@/components/admin/VestaraInvestmentsTab";
import { InvestmentApprovalsTab } from "@/components/admin/InvestmentApprovalsTab";
import { VestaraAuditExportTab } from "@/components/admin/VestaraAuditExportTab";
import { VfdWebhookDlqTab } from "@/components/admin/VfdWebhookDlqTab";
import { VfdAuditTab } from "@/components/admin/VfdAuditTab";
import { RolesPermissionsTab } from "@/components/admin/RolesPermissionsTab";
import { Percent, PiggyBank, FileSpreadsheet, AlertTriangle, ScanLine, UserCog } from "lucide-react";

export default function Admin() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { hasPermission, loading: permLoading } = useAdminPermissions();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!adminLoading && !isAdmin && user) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      navigate("/admin/login");
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
    <div className="min-h-screen min-h-[100dvh] bg-background pb-8">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
              <h1 className="text-lg sm:text-2xl font-bold truncate">Admin Dashboard</h1>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/recurring-test")} className="flex items-center gap-1 flex-shrink-0 text-xs sm:text-sm">
            <FlaskConical className="h-4 w-4" />
            <span className="hidden sm:inline">Recurring Test Lab</span>
            <span className="sm:hidden">Test</span>
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Tabs for different admin sections */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex overflow-x-auto h-auto gap-1 w-full justify-start no-scrollbar pb-1">
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
            {hasPermission("transactions.view") && (
              <TabsTrigger value="contributions" className="flex items-center gap-1">
                <Wallet className="h-4 w-4" />
                Contributions
              </TabsTrigger>
            )}
            {hasPermission("transactions.view") && (
              <TabsTrigger value="payment-auth" className="flex items-center gap-1">
                <CreditCard className="h-4 w-4" />
                Payment Auth
              </TabsTrigger>
            )}
            {hasPermission("transactions.view") && (
              <TabsTrigger value="withdrawals" className="flex items-center gap-1">
                <ArrowDownToLine className="h-4 w-4" />
                Withdrawals
              </TabsTrigger>
            )}
            {hasPermission("support.view") && (
              <TabsTrigger value="support" className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                Support
              </TabsTrigger>
            )}
            <TabsTrigger value="emails" className="flex items-center gap-1">
              <Mail className="h-4 w-4" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="vestara-rates" className="flex items-center gap-1">
              <Percent className="h-4 w-4" />
              Vestara Rates
            </TabsTrigger>
            <TabsTrigger value="vestara-investments" className="flex items-center gap-1">
              <PiggyBank className="h-4 w-4" />
              Investments
            </TabsTrigger>
            {hasPermission("audit.view") && (
              <TabsTrigger value="vestara-audit" className="flex items-center gap-1">
                <FileSpreadsheet className="h-4 w-4" />
                Vestara Audit Export
              </TabsTrigger>
            )}
            {hasPermission("audit.view") && (
              <TabsTrigger value="vfd-dlq" className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                VFD DLQ
              </TabsTrigger>
            )}
            {hasPermission("audit.view") && (
              <TabsTrigger value="vfd-audit" className="flex items-center gap-1">
                <ScanLine className="h-4 w-4" />
                VFD Audit
              </TabsTrigger>
            )}
            {hasPermission("roles.manage") && (
              <TabsTrigger value="roles" className="flex items-center gap-1">
                <UserCog className="h-4 w-4" />
                Roles & Access
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
            <GroupManagementTab />
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

          <TabsContent value="contributions">
            <ContributionsTab />
          </TabsContent>

          <TabsContent value="payment-auth">
            <PaymentAuthTab />
          </TabsContent>

          <TabsContent value="withdrawals">
            <WithdrawalsTab />
          </TabsContent>

          <TabsContent value="support">
            <SupportTab />
          </TabsContent>

          <TabsContent value="emails">
            <AdminEmailTab />
          </TabsContent>

          <TabsContent value="vestara-rates">
            <VestaraRateConfigTab />
          </TabsContent>

          <TabsContent value="vestara-investments">
            <VestaraInvestmentsTab />
          </TabsContent>

          <TabsContent value="vestara-audit">
            <VestaraAuditExportTab />
          </TabsContent>

          <TabsContent value="vfd-dlq">
            <VfdWebhookDlqTab />
          </TabsContent>

          <TabsContent value="vfd-audit">
            <VfdAuditTab />
          </TabsContent>

          <TabsContent value="roles">
            <RolesPermissionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
