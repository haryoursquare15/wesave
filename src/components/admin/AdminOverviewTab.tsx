 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Skeleton } from "@/components/ui/skeleton";
 import { Badge } from "@/components/ui/badge";
 import { 
   Users, UsersRound, Activity, Wallet, TrendingUp, TrendingDown,
   AlertTriangle, CheckCircle, Clock, Banknote, Shield, TicketCheck
 } from "lucide-react";
 import { useEnhancedAdminStats, TimeFilter } from "@/hooks/useEnhancedAdminStats";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { useState } from "react";
 
 interface StatCardProps {
   title: string;
   value: string | number;
   icon: React.ReactNode;
   trend?: number;
   subtitle?: string;
   loading?: boolean;
   variant?: "default" | "success" | "warning" | "danger";
 }
 
 function StatCard({ title, value, icon, trend, subtitle, loading, variant = "default" }: StatCardProps) {
   const variantStyles = {
     default: "bg-card",
     success: "bg-success/5 border-success/20",
     warning: "bg-warning/5 border-warning/20",
     danger: "bg-destructive/5 border-destructive/20",
   };
 
   return (
     <Card className={variantStyles[variant]}>
       <CardHeader className="flex flex-row items-center justify-between pb-2">
         <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
         <div className="text-muted-foreground">{icon}</div>
       </CardHeader>
       <CardContent>
         {loading ? (
           <Skeleton className="h-8 w-24" />
         ) : (
           <>
             <div className="text-2xl font-bold">{value}</div>
             {subtitle && (
               <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
             )}
             {trend !== undefined && (
               <div className={`flex items-center gap-1 text-xs mt-1 ${trend >= 0 ? "text-success" : "text-destructive"}`}>
                 {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                 <span>{Math.abs(trend)}% from last period</span>
               </div>
             )}
           </>
         )}
       </CardContent>
     </Card>
   );
 }
 
 export function AdminOverviewTab() {
   const [timeFilter, setTimeFilter] = useState<TimeFilter>("30d");
   const { stats, loading } = useEnhancedAdminStats(timeFilter);
 
   return (
     <div className="space-y-6">
       {/* Time Filter */}
       <div className="flex justify-end">
         <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
           <SelectTrigger className="w-40">
             <SelectValue />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="today">Today</SelectItem>
             <SelectItem value="7d">Last 7 days</SelectItem>
             <SelectItem value="30d">Last 30 days</SelectItem>
           </SelectContent>
         </Select>
       </div>
 
       {/* User Stats */}
       <div>
         <h3 className="text-sm font-medium text-muted-foreground mb-3">Users</h3>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           <StatCard
             title="Total Users"
             value={stats?.total_users?.toLocaleString() || 0}
             icon={<Users className="h-4 w-4" />}
             subtitle={`${stats?.verified_users || 0} verified`}
             loading={loading}
           />
           <StatCard
             title="Verified Users"
             value={stats?.verified_users?.toLocaleString() || 0}
             icon={<CheckCircle className="h-4 w-4" />}
             loading={loading}
             variant="success"
           />
           <StatCard
             title="Pending Verification"
             value={stats?.unverified_users?.toLocaleString() || 0}
             icon={<Clock className="h-4 w-4" />}
             loading={loading}
             variant="warning"
           />
         </div>
       </div>
 
       {/* Financial Stats */}
       <div>
         <h3 className="text-sm font-medium text-muted-foreground mb-3">Financials</h3>
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <StatCard
             title="Total Wallet Balance"
             value={`₦${(stats?.total_wallet_balance || 0).toLocaleString()}`}
             icon={<Wallet className="h-4 w-4" />}
             loading={loading}
           />
           <StatCard
             title="Funding Volume"
             value={`₦${(stats?.total_funding_volume || 0).toLocaleString()}`}
             icon={<TrendingUp className="h-4 w-4" />}
             loading={loading}
           />
           <StatCard
             title="Total Payouts"
             value={`₦${(stats?.total_payouts || 0).toLocaleString()}`}
             icon={<Banknote className="h-4 w-4" />}
             loading={loading}
           />
           <StatCard
             title="Platform Revenue"
             value={`₦${(stats?.platform_revenue || 0).toLocaleString()}`}
             icon={<Banknote className="h-4 w-4" />}
             loading={loading}
             variant="success"
           />
         </div>
       </div>
 
       {/* Thrift Stats */}
       <div>
         <h3 className="text-sm font-medium text-muted-foreground mb-3">Thrift Groups</h3>
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <StatCard
             title="Total Groups"
             value={stats?.total_groups?.toLocaleString() || 0}
             icon={<UsersRound className="h-4 w-4" />}
             loading={loading}
           />
           <StatCard
             title="Active Groups"
             value={stats?.active_groups?.toLocaleString() || 0}
             icon={<Activity className="h-4 w-4" />}
             loading={loading}
           />
           <StatCard
             title="Completed Cycles"
             value={stats?.completed_cycles?.toLocaleString() || 0}
             icon={<CheckCircle className="h-4 w-4" />}
             loading={loading}
           />
           <StatCard
             title="Contributions Today"
             value={stats?.contributions_today?.toLocaleString() || 0}
             icon={<Wallet className="h-4 w-4" />}
             loading={loading}
           />
         </div>
       </div>
 
       {/* Operations Stats */}
       <div>
         <h3 className="text-sm font-medium text-muted-foreground mb-3">Operations & Risk</h3>
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <StatCard
             title="Failed Transactions"
             value={stats?.failed_transactions?.toLocaleString() || 0}
             icon={<AlertTriangle className="h-4 w-4" />}
             loading={loading}
             variant={stats?.failed_transactions && stats.failed_transactions > 0 ? "danger" : "default"}
           />
           <StatCard
             title="Risk Alerts"
             value={stats?.risk_alerts?.toLocaleString() || 0}
             icon={<Shield className="h-4 w-4" />}
             loading={loading}
             variant={stats?.risk_alerts && stats.risk_alerts > 0 ? "warning" : "default"}
           />
           <StatCard
             title="Pending Requests"
             value={stats?.pending_requests?.toLocaleString() || 0}
             icon={<Clock className="h-4 w-4" />}
             loading={loading}
             variant={stats?.pending_requests && stats.pending_requests > 0 ? "warning" : "default"}
           />
           <StatCard
             title="Open Tickets"
             value={stats?.open_tickets?.toLocaleString() || 0}
             icon={<TicketCheck className="h-4 w-4" />}
             loading={loading}
           />
         </div>
       </div>
     </div>
   );
 }