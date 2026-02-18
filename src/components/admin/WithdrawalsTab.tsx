import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { RefreshCw, ArrowDownToLine, CheckCircle, Clock, XCircle, Download } from "lucide-react";
import { exportToCSV } from "@/lib/exportUtils";

interface LedgerWithdrawal {
  id: string;
  user_id: string;
  user_name?: string;
  amount: number;
  entry_type: string;
  description: string | null;
  reference_type: string;
  reference_id: string | null;
  created_at: string;
}

type WithdrawalFilter = "all" | "freeze" | "unfreeze" | "debit";

export function WithdrawalsTab() {
  const [withdrawals, setWithdrawals] = useState<LedgerWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<WithdrawalFilter>("all");

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("ledger_entries")
        .select("id, user_id, amount, entry_type, description, reference_type, reference_id, created_at")
        .in("reference_type", ["withdrawal", "withdrawal_reversal"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") {
        query = query.eq("entry_type", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      let entries = data || [];

      // Resolve usernames
      const userIds = [...new Set(entries.map(e => e.user_id))];
      if (userIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, username").in("id", userIds);
        const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name || p.username || p.id.slice(0, 8)]));
        entries = entries.map(e => ({ ...e, user_name: profileMap.get(e.user_id) }));
      }

      setWithdrawals(entries);
    } catch (err) {
      console.error("Error fetching withdrawals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWithdrawals(); }, [statusFilter]);

  const totalAmount = withdrawals.reduce((sum, w) => sum + Math.abs(w.amount), 0);

  const getEntryBadge = (entryType: string, refType: string) => {
    if (refType === "withdrawal_reversal") return <Badge variant="outline" className="text-warning border-warning/50"><RefreshCw className="h-3 w-3 mr-1" />Reversed</Badge>;
    switch (entryType) {
      case "debit": return <Badge className="bg-success/10 text-success border-success/20"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case "freeze": return <Badge variant="outline" className="text-warning border-warning/50"><Clock className="h-3 w-3 mr-1" />Processing</Badge>;
      case "unfreeze": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed/Released</Badge>;
      default: return <Badge variant="secondary">{entryType}</Badge>;
    }
  };

  const handleExport = () => {
    exportToCSV(withdrawals.map(w => ({
      User: w.user_name || w.user_id,
      Amount: Math.abs(w.amount),
      Status: w.reference_type === "withdrawal_reversal" ? "Reversed" : w.entry_type === "debit" ? "Completed" : w.entry_type === "freeze" ? "Processing" : "Failed/Released",
      Description: w.description || "",
      Reference: w.reference_id || "",
      Date: format(new Date(w.created_at), "yyyy-MM-dd HH:mm:ss"),
    })), "withdrawals");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold">{withdrawals.length}</div><div className="text-xs text-muted-foreground">Total Withdrawals</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold">₦{totalAmount.toLocaleString()}</div><div className="text-xs text-muted-foreground">Total Volume</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-warning">{withdrawals.filter(w => w.entry_type === "freeze").length}</div><div className="text-xs text-muted-foreground">Processing</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5" />Withdrawal Ledger</CardTitle>
              <CardDescription>All withdrawal entries from the ledger</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as WithdrawalFilter)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Filter" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="debit">Completed</SelectItem>
                  <SelectItem value="freeze">Processing</SelectItem>
                  <SelectItem value="unfreeze">Failed/Released</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchWithdrawals}><RefreshCw className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={!withdrawals.length}><Download className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawals.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium text-sm">{w.user_name || w.user_id.slice(0, 8) + "..."}</TableCell>
                      <TableCell className="font-medium">₦{Math.abs(w.amount).toLocaleString()}</TableCell>
                      <TableCell>{getEntryBadge(w.entry_type, w.reference_type)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{w.description || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{w.reference_id?.slice(0, 12) || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(w.created_at), "MMM d, HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {withdrawals.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No withdrawals found</TableCell></TableRow>
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
