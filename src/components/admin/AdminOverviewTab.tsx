import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Users, UsersRound, Activity, Wallet, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock, Banknote, Shield, TicketCheck, Download, Search
} from "lucide-react";
import { useEnhancedAdminStats, TimeFilter } from "@/hooks/useEnhancedAdminStats";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { exportToCSV } from "@/lib/exportUtils";

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

interface UserWalletRow {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  available_balance: number;
  locked_balance: number;
}

export function AdminOverviewTab() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("30d");
  const { stats, loading } = useEnhancedAdminStats(timeFilter);
  const [userWallets, setUserWallets] = useState<UserWalletRow[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [walletSearch, setWalletSearch] = useState("");

  useEffect(() => {
    const fetchUserWallets = async () => {
      setWalletsLoading(true);
      try {
        const { data: wallets } = await supabase
          .from("wallets")
          .select("user_id, available_balance, locked_balance")
          .order("available_balance", { ascending: false })
          .limit(200);

        if (!wallets?.length) { setUserWallets([]); return; }

        const userIds = wallets.map(w => w.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username, email")
          .in("id", userIds);

        const profileMap = new Map((profiles || []).map(p => [p.id, p]));
        setUserWallets(wallets.map(w => {
          const p = profileMap.get(w.user_id);
          return {
            id: w.user_id,
            full_name: p?.full_name || null,
            username: p?.username || null,
            email: p?.email || null,
            available_balance: w.available_balance || 0,
            locked_balance: w.locked_balance || 0,
          };
        }));
      } catch (err) {
        console.error("Error fetching user wallets:", err);
      } finally {
        setWalletsLoading(false);
      }
    };
    fetchUserWallets();
  }, []);

  const filteredWallets = userWallets.filter(u => {
    const s = walletSearch.toLowerCase();
    return !s || u.full_name?.toLowerCase().includes(s) || u.username?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  const handleExportWallets = () => {
    exportToCSV(filteredWallets.map(u => ({
      Name: u.full_name || "—",
      Username: u.username || "—",
      Email: u.email || "—",
      "Available Balance": u.available_balance,
      "Locked Balance": u.locked_balance,
      "Total": u.available_balance + u.locked_balance,
    })), "user_wallets");
  };

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
          <StatCard title="Total Users" value={stats?.total_users?.toLocaleString() || 0} icon={<Users className="h-4 w-4" />} subtitle={`${stats?.verified_users || 0} verified`} loading={loading} />
          <StatCard title="Verified Users" value={stats?.verified_users?.toLocaleString() || 0} icon={<CheckCircle className="h-4 w-4" />} loading={loading} variant="success" />
          <StatCard title="Pending Verification" value={stats?.unverified_users?.toLocaleString() || 0} icon={<Clock className="h-4 w-4" />} loading={loading} variant="warning" />
        </div>
      </div>

      {/* Financial Stats */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Financials</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Wallet Balance" value={`₦${(stats?.total_wallet_balance || 0).toLocaleString()}`} icon={<Wallet className="h-4 w-4" />} loading={loading} />
          <StatCard title="Funding Volume" value={`₦${(stats?.total_funding_volume || 0).toLocaleString()}`} icon={<TrendingUp className="h-4 w-4" />} loading={loading} />
          <StatCard title="Total Payouts" value={`₦${(stats?.total_payouts || 0).toLocaleString()}`} icon={<Banknote className="h-4 w-4" />} loading={loading} />
          <StatCard title="Platform Revenue" value={`₦${(stats?.platform_revenue || 0).toLocaleString()}`} icon={<Banknote className="h-4 w-4" />} loading={loading} variant="success" />
        </div>
      </div>

      {/* Thrift Stats */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Thrift Groups</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Groups" value={stats?.total_groups?.toLocaleString() || 0} icon={<UsersRound className="h-4 w-4" />} loading={loading} />
          <StatCard title="Active Groups" value={stats?.active_groups?.toLocaleString() || 0} icon={<Activity className="h-4 w-4" />} loading={loading} />
          <StatCard title="Completed Cycles" value={stats?.completed_cycles?.toLocaleString() || 0} icon={<CheckCircle className="h-4 w-4" />} loading={loading} />
          <StatCard title="Contributions Today" value={stats?.contributions_today?.toLocaleString() || 0} icon={<Wallet className="h-4 w-4" />} loading={loading} />
        </div>
      </div>

      {/* Operations Stats */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Operations & Risk</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Failed Transactions" value={stats?.failed_transactions?.toLocaleString() || 0} icon={<AlertTriangle className="h-4 w-4" />} loading={loading} variant={stats?.failed_transactions && stats.failed_transactions > 0 ? "danger" : "default"} />
          <StatCard title="Risk Alerts" value={stats?.risk_alerts?.toLocaleString() || 0} icon={<Shield className="h-4 w-4" />} loading={loading} variant={stats?.risk_alerts && stats.risk_alerts > 0 ? "warning" : "default"} />
          <StatCard title="Pending Requests" value={stats?.pending_requests?.toLocaleString() || 0} icon={<Clock className="h-4 w-4" />} loading={loading} variant={stats?.pending_requests && stats.pending_requests > 0 ? "warning" : "default"} />
          <StatCard title="Open Tickets" value={stats?.open_tickets?.toLocaleString() || 0} icon={<TicketCheck className="h-4 w-4" />} loading={loading} />
        </div>
      </div>

      {/* User Wallets Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> User Wallets</CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or username..." className="pl-9" value={walletSearch} onChange={(e) => setWalletSearch(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" onClick={handleExportWallets} disabled={!filteredWallets.length}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {walletsLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Locked</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWallets.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">@{u.username || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.email || "—"}</TableCell>
                      <TableCell className="text-right font-medium">₦{u.available_balance.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-warning">₦{u.locked_balance.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-bold">₦{(u.available_balance + u.locked_balance).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {filteredWallets.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
