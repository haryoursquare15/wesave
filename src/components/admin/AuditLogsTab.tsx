import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Search, RefreshCw, Eye, Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { exportToCSV } from "@/lib/exportUtils";

interface ActivityLog {
  id: string;
  user_id: string;
  user_name?: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  source: "audit" | "ledger";
}

type ActivityFilter = "all" | "admin" | "withdrawal" | "funding" | "contribution" | "payout" | "group";

export function AuditLogsTab() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Fetch admin audit logs
      const { data: auditData } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      const auditLogs: ActivityLog[] = (auditData || []).map(log => ({
        ...log,
        source: "audit" as const,
      }));

      // Fetch user activity from ledger_entries (withdrawals, funding, contributions, payouts)
      const { data: ledgerData } = await supabase
        .from("ledger_entries")
        .select("id, user_id, entry_type, reference_type, reference_id, description, amount, balance_after, created_at")
        .order("created_at", { ascending: false })
        .limit(300);

      const ledgerLogs: ActivityLog[] = (ledgerData || []).map(entry => ({
        id: entry.id,
        user_id: entry.user_id,
        action: `${entry.entry_type}_${entry.reference_type}`,
        resource_type: entry.reference_type,
        resource_id: entry.reference_id,
        details: { amount: entry.amount, balance_after: entry.balance_after, description: entry.description },
        ip_address: null,
        user_agent: null,
        created_at: entry.created_at,
        source: "ledger" as const,
      }));

      // Merge and sort by date
      let allLogs = [...auditLogs, ...ledgerLogs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Fetch usernames for all user_ids
      const userIds = [...new Set(allLogs.map(l => l.user_id))];
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", userIds);
        const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name || p.username || p.id.slice(0, 8)]));
        allLogs = allLogs.map(l => ({ ...l, user_name: profileMap.get(l.user_id) || l.user_id.slice(0, 8) }));
      }

      setLogs(allLogs);
    } catch (err) {
      console.error("Error fetching activity logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const filteredLogs = logs.filter(log => {
    // Activity type filter
    if (activityFilter !== "all") {
      switch (activityFilter) {
        case "admin": if (log.source !== "audit") return false; break;
        case "withdrawal": if (log.resource_type !== "withdrawal") return false; break;
        case "funding": if (log.resource_type !== "wallet_funding") return false; break;
        case "contribution": if (log.resource_type !== "group_contribution") return false; break;
        case "payout": if (log.resource_type !== "group_payout") return false; break;
        case "group": if (!["group_contribution", "group_payout"].includes(log.resource_type)) return false; break;
      }
    }
    // Text search
    if (search) {
      const s = search.toLowerCase();
      return (
        log.action.toLowerCase().includes(s) ||
        log.resource_type.toLowerCase().includes(s) ||
        log.user_name?.toLowerCase().includes(s) ||
        log.user_id.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const getActionBadge = (log: ActivityLog) => {
    if (log.source === "ledger") {
      const typeColors: Record<string, string> = {
        withdrawal: "bg-orange-500/10 text-orange-600",
        wallet_funding: "bg-purple-500/10 text-purple-600",
        group_contribution: "bg-blue-500/10 text-blue-600",
        group_payout: "bg-green-500/10 text-green-600",
        card_tokenization: "bg-yellow-500/10 text-yellow-600",
        opening_balance: "bg-muted text-muted-foreground",
      };
      const color = typeColors[log.resource_type] || "";
      return <Badge className={color}>{log.resource_type.replace(/_/g, " ")}</Badge>;
    }
    const action = log.action;
    if (action.includes("create") || action.includes("add")) return <Badge className="bg-success/10 text-success">{action}</Badge>;
    if (action.includes("delete") || action.includes("remove")) return <Badge variant="destructive">{action}</Badge>;
    if (action.includes("update") || action.includes("edit")) return <Badge className="bg-primary/10 text-primary">{action}</Badge>;
    if (action.includes("freeze") || action.includes("restrict")) return <Badge className="bg-warning/10 text-warning">{action}</Badge>;
    return <Badge variant="outline">{action}</Badge>;
  };

  const handleExport = () => {
    exportToCSV(filteredLogs.map(log => ({
      Timestamp: format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss"),
      User: log.user_name || log.user_id,
      Action: log.action,
      "Resource Type": log.resource_type,
      "Resource ID": log.resource_id || "",
      Source: log.source,
      Amount: log.details?.amount || "",
      Description: log.details?.description || "",
      "IP Address": log.ip_address || "",
    })), "activity_logs");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Activity & Audit Logs</CardTitle>
            <CardDescription>All user activities and admin actions</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!filteredLogs.length}><Download className="h-4 w-4 mr-1" /> Export</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by action, user, resource..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={activityFilter} onValueChange={(v) => setActivityFilter(v as ActivityFilter)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Filter type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              <SelectItem value="admin">Admin Actions</SelectItem>
              <SelectItem value="withdrawal">Withdrawals</SelectItem>
              <SelectItem value="funding">Wallet Funding</SelectItem>
              <SelectItem value="contribution">Contributions</SelectItem>
              <SelectItem value="payout">Payouts</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.slice(0, 300).map((log) => (
                  <TableRow key={`${log.source}-${log.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{log.user_name || log.user_id.slice(0, 8)}</div>
                    </TableCell>
                    <TableCell>{getActionBadge(log)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium">{log.resource_type.replace(/_/g, " ")}</span>
                        {log.resource_id && <span className="text-muted-foreground ml-1 text-xs">({String(log.resource_id).slice(0, 8)}...)</span>}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {log.details?.amount ? `₦${Math.abs(log.details.amount).toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{log.source}</Badge>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}><Eye className="h-4 w-4" /></Button>
                        </DialogTrigger>
                        {selectedLog?.id === log.id && selectedLog?.source === log.source && (
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Activity Details</DialogTitle>
                              <DialogDescription>Full record</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 text-sm">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="text-muted-foreground">User:</div>
                                <div>{log.user_name || log.user_id}</div>
                                <div className="text-muted-foreground">Action:</div>
                                <div>{log.action}</div>
                                <div className="text-muted-foreground">Resource:</div>
                                <div>{log.resource_type}</div>
                                {log.ip_address && <>
                                  <div className="text-muted-foreground">IP Address:</div>
                                  <div>{log.ip_address}</div>
                                </>}
                                <div className="text-muted-foreground">Timestamp:</div>
                                <div>{format(new Date(log.created_at), "PPpp")}</div>
                              </div>
                              {log.details && (
                                <div>
                                  <div className="text-muted-foreground mb-1">Details:</div>
                                  <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-48">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        )}
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No activities found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
