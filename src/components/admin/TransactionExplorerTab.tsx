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
import { exportToCSV } from "@/lib/exportUtils";
import { describeTransaction } from "@/lib/transactionLabels";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

interface Transaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  vfd_reference?: string | null;
  session_id?: string | null;
  description: string | null;
  created_at: string;
  source: "sandbox" | "legacy" | "bills" | "ledger";
  user_name?: string;
  username?: string;
  category?: string;
  label?: string;
}

export function TransactionExplorerTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const [sandbox, legacy, bills, ledger] = await Promise.all([
        supabase
          .from("vfd_sandbox_transactions")
          .select("id,user_id,transaction_type,amount,status,reference,vfd_reference,session_id,description,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("transactions")
          .select("id,user_id,type,amount,status,reference,description,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("vfd_sandbox_bill_receipts")
          .select("id,user_id,reference,category,biller_name,payment_item_name,customer_id,phone_number,amount,convenience_fee,status,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("vestara_transactions")
          .select("id,initiated_by,type,amount,status,reference,metadata,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const rows: Transaction[] = [];
      (sandbox.data ?? []).forEach((r: any) => rows.push({
        id: r.id, user_id: r.user_id, type: r.transaction_type, amount: Number(r.amount),
        status: r.status, reference: r.reference, vfd_reference: r.vfd_reference,
        session_id: r.session_id, description: r.description, created_at: r.created_at,
        source: "sandbox",
      }));
      (legacy.data ?? []).forEach((r: any) => rows.push({
        id: r.id, user_id: r.user_id, type: r.type, amount: Number(r.amount),
        status: r.status, reference: r.reference, description: r.description,
        created_at: r.created_at, source: "legacy",
      }));
      (bills.data ?? []).forEach((r: any) => rows.push({
        id: r.id,
        user_id: r.user_id,
        type: "bill_payment",
        amount: Number(r.amount) + Number(r.convenience_fee || 0),
        status: r.status === "successful" ? "completed" : r.status,
        reference: r.reference,
        description: `Bill Payment: ${r.biller_name || r.category || "Bill"} - ${r.customer_id || r.phone_number || ""}${r.payment_item_name ? ` (${r.payment_item_name})` : ""}`,
        created_at: r.created_at,
        source: "bills",
      }));
      (ledger.data ?? []).forEach((r: any) => rows.push({
        id: r.id,
        user_id: r.initiated_by,
        type: r.type,
        amount: Number(r.amount),
        status: r.status,
        reference: r.reference,
        description: (r.metadata?.description as string) || (r.metadata?.note as string) || String(r.type || "").replace(/_/g, " "),
        created_at: r.created_at,
        source: "ledger",
      }));
      const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", userIds);
        const profileMap = new Map((profiles || []).map(p => [p.id, p]));
        rows.forEach(r => {
          const p: any = profileMap.get(r.user_id);
          r.user_name = p?.full_name || undefined;
          r.username = p?.username || undefined;
        });
      }

      rows.forEach(r => {
        const info = describeTransaction({
          transaction_type: r.type,
          description: r.description,
          reference: r.reference,
        });
        r.category = info.category;
        r.label = info.title;
      });

      rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      setTransactions(rows);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTransactions(); }, []);

  const filteredTransactions = transactions.filter(tx => {
    if (typeFilter !== "all" && tx.type !== typeFilter) return false;
    if (statusFilter !== "all" && tx.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      tx.reference?.toLowerCase().includes(s) ||
      tx.vfd_reference?.toLowerCase().includes(s) ||
      tx.session_id?.toLowerCase().includes(s) ||
      tx.user_id.toLowerCase().includes(s) ||
      tx.user_name?.toLowerCase().includes(s) ||
      tx.username?.toLowerCase().includes(s) ||
      tx.description?.toLowerCase().includes(s) ||
      tx.id.toLowerCase().includes(s)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-success/10 text-success border-success/20">Completed</Badge>;
      case "pending":
        return <Badge variant="outline" className="text-warning border-warning/50">Pending</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Transaction Explorer</CardTitle>
            <CardDescription>Sandbox wallet + legacy platform transactions</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchTransactions}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" disabled={!filteredTransactions.length} onClick={() => {
              exportToCSV(filteredTransactions.map(tx => ({
                Customer: tx.user_name || "",
                Username: tx.username || "",
                Reference: tx.reference || tx.id,
                "VFD Ref": tx.vfd_reference || "",
                "NIBSS Session": tx.session_id || "",
                Type: tx.type,
                Amount: tx.amount,
                Status: tx.status,
                Source: tx.source,
                Description: tx.description || "",
                Date: format(new Date(tx.created_at), "yyyy-MM-dd HH:mm:ss"),
                "User ID": tx.user_id,
              })), "transactions");
            }}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by reference, VFD ref, NIBSS session, user ID..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="contribution">Contribution</SelectItem>
              <SelectItem value="payout">Payout</SelectItem>
              <SelectItem value="funding">Funding</SelectItem>
              <SelectItem value="withdrawal">Withdrawal</SelectItem>
              <SelectItem value="service_fee">Service Fee</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx) => (
                  <TableRow key={`${tx.source}-${tx.id}`}>
                    <TableCell className="text-sm">
                      <div className="font-medium">{tx.user_name || tx.user_id.slice(0, 8) + "…"}</div>
                      <div className="text-xs text-muted-foreground">{tx.username ? `@${tx.username}` : "—"}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">
                      {tx.reference || tx.id}
                    </TableCell>
                    <TableCell><Badge variant="outline">{tx.type}</Badge></TableCell>
                    <TableCell className="font-medium">₦{tx.amount.toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(tx.status)}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{tx.source}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(tx.created_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedTx(tx)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        {selectedTx?.id === tx.id && (
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Transaction Details</DialogTitle>
                              <DialogDescription>Full transaction information</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 text-sm">
                              <div className="grid grid-cols-[120px_1fr] gap-2">
                                <div className="text-muted-foreground">ID:</div>
                                <div className="font-mono text-xs break-all">{tx.id}</div>
                                <div className="text-muted-foreground">Reference:</div>
                                <div className="font-mono text-xs break-all">{tx.reference || "—"}</div>
                                <div className="text-muted-foreground">VFD Ref:</div>
                                <div className="font-mono text-xs break-all">{tx.vfd_reference || "—"}</div>
                                <div className="text-muted-foreground">NIBSS Session:</div>
                                <div className="font-mono text-xs break-all">{tx.session_id || "—"}</div>
                                <div className="text-muted-foreground">User ID:</div>
                                <div className="font-mono text-xs break-all">{tx.user_id}</div>
                                <div className="text-muted-foreground">Type:</div>
                                <div>{tx.type}</div>
                                <div className="text-muted-foreground">Amount:</div>
                                <div className="font-bold">₦{tx.amount.toLocaleString()}</div>
                                <div className="text-muted-foreground">Status:</div>
                                <div>{getStatusBadge(tx.status)}</div>
                                <div className="text-muted-foreground">Source:</div>
                                <div>{tx.source}</div>
                                <div className="text-muted-foreground">Description:</div>
                                <div>{tx.description || "—"}</div>
                                <div className="text-muted-foreground">Created:</div>
                                <div>{format(new Date(tx.created_at), "PPpp")}</div>
                              </div>
                            </div>
                          </DialogContent>
                        )}
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
