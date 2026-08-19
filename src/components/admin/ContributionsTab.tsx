import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// LEGACY (WeSave decommission): this file still queries dropped tables/RPCs.
// Kept as dead code pending a dedicated frontend cleanup pass.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;
import { format } from "date-fns";
import { RefreshCw, CheckCircle, Clock, CreditCard, AlertTriangle, XCircle, Search, Download } from "lucide-react";
import { exportToCSV } from "@/lib/exportUtils";
import { useToast } from "@/hooks/use-toast";

interface ContributionRow {
  id: string;
  user_id: string;
  group_id: string | null;
  cycle_id: string | null;
  amount: number;
  status: string | null;
  card_charge_status: string | null;
  contributed_at: string | null;
  created_at: string;
  source: "legacy" | "sandbox";
  reference?: string | null;
}

interface PendingCharge {
  id: string;
  user_id: string;
  group_id: string;
  cycle_id: string;
  amount: number;
  status: string;
  tx_ref: string;
  flw_transaction_id: string | null;
  retry_count: number | null;
  failure_reason: string | null;
  created_at: string;
}

export function ContributionsTab() {
  const [contributions, setContributions] = useState<ContributionRow[]>([]);
  const [pendingCharges, setPendingCharges] = useState<PendingCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [verifying, setVerifying] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [legacyRes, sandboxRes, pendingRes] = await Promise.all([
        supabase
          .from("cycle_contributions")
          .select("id, user_id, group_id, cycle_id, amount, status, card_charge_status, contributed_at, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        // Sandbox contribution activity lives in the transactions table with a
        // thrift/contribution keyword in the description.
        supabase
          .from("vfd_sandbox_transactions")
          .select("id, user_id, amount, status, reference, description, created_at")
          .or("description.ilike.%contribution%,description.ilike.%thrift%,description.ilike.%ajo%,description.ilike.%target%")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("pending_card_charges")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const rows: ContributionRow[] = [];
      (legacyRes.data ?? []).forEach((c: any) => rows.push({
        id: c.id, user_id: c.user_id, group_id: c.group_id, cycle_id: c.cycle_id,
        amount: Number(c.amount), status: c.status, card_charge_status: c.card_charge_status,
        contributed_at: c.contributed_at, created_at: c.created_at, source: "legacy",
      }));
      (sandboxRes.data ?? []).forEach((c: any) => rows.push({
        id: c.id, user_id: c.user_id, group_id: null, cycle_id: null,
        amount: Number(c.amount), status: c.status, card_charge_status: null,
        contributed_at: c.created_at, created_at: c.created_at, source: "sandbox",
        reference: c.reference,
      }));
      rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

      const filtered = statusFilter === "all"
        ? rows
        : rows.filter(r => r.status === statusFilter);

      const userIds = [...new Set(filtered.map(r => r.user_id).filter(Boolean))];
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", userIds);
        const profileMap = new Map((profiles || []).map(p => [p.id, p]));
        filtered.forEach(r => {
          const p: any = profileMap.get(r.user_id);
          r.user_name = p?.full_name || undefined;
          r.username = p?.username || undefined;
        });
      }

      setContributions(filtered);
      setPendingCharges(pendingRes.data || []);
    } catch (err) {
      console.error("Error fetching contributions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const handleManualVerify = async (chargeId: string) => {
    setVerifying(chargeId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contribution-reconciler`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: "manual_verify", chargeId }),
        }
      );
      const result = await resp.json();
      if (result.success) {
        toast({ title: "Charge verified", description: "Contribution confirmed successfully." });
        fetchData();
      } else {
        toast({ title: "Verification failed", description: result.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not verify charge.", variant: "destructive" });
    } finally {
      setVerifying(null);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "completed": return <Badge className="bg-success/10 text-success border-success/20">Completed</Badge>;
      case "pending": return <Badge variant="outline" className="text-warning border-warning/50">Pending Wallet</Badge>;
      case "pending_card": return <Badge variant="outline" className="text-orange-500 border-orange-500/50"><CreditCard className="h-3 w-3 mr-1" />Pending Card</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="secondary">{status || "—"}</Badge>;
    }
  };

  const getChargeBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="text-warning border-warning/50"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "successful": return <Badge className="bg-success/10 text-success border-success/20"><CheckCircle className="h-3 w-3 mr-1" />Confirmed</Badge>;
      case "failed": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case "unresolved": return <Badge className="bg-destructive/10 text-destructive border-destructive/20"><AlertTriangle className="h-3 w-3 mr-1" />Unresolved</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const stats = {
    completed: contributions.filter(c => c.status === "completed").length,
    pendingWallet: contributions.filter(c => c.status === "pending").length,
    pendingCard: pendingCharges.filter(c => c.status === "pending").length,
    failed: pendingCharges.filter(c => c.status === "failed").length,
    unresolved: pendingCharges.filter(c => c.status === "unresolved").length,
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-success">{stats.completed}</div><div className="text-xs text-muted-foreground">Completed</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-warning">{stats.pendingWallet}</div><div className="text-xs text-muted-foreground">Pending Wallet</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-orange-500">{stats.pendingCard}</div><div className="text-xs text-muted-foreground">Pending Card</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-destructive">{stats.failed}</div><div className="text-xs text-muted-foreground">Failed</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-destructive">{stats.unresolved}</div><div className="text-xs text-muted-foreground">Unresolved</div></CardContent></Card>
      </div>

      {/* Contributions table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Cycle Contributions</CardTitle>
              <CardDescription>All contribution records across groups</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="pending_card">Pending Card</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
               <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
               <Button variant="outline" size="sm" disabled={!contributions.length} onClick={() => {
                 exportToCSV(contributions.map(c => ({
                   Customer: c.user_name || "",
                   Username: c.username || "",
                   "User ID": c.user_id,
                   Amount: c.amount,
                   Status: c.status || "",
                   "Card Status": c.card_charge_status || "",
                   Date: format(new Date(c.created_at), "yyyy-MM-dd HH:mm:ss"),
                 })), "contributions");
               }}><Download className="h-4 w-4" /></Button>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Card Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contributions.map(c => (
                    <TableRow key={`${c.source}-${c.id}`}>
                      <TableCell className="text-sm">
                        <div className="font-medium">{c.user_name || c.user_id.slice(0, 8) + "…"}</div>
                        <div className="text-xs text-muted-foreground">{c.username ? `@${c.username}` : "—"}</div>
                      </TableCell>
                      <TableCell className="font-medium">₦{c.amount.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(c.status)}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{c.source}</Badge></TableCell>
                      <TableCell>{c.card_charge_status ? getChargeBadge(c.card_charge_status) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(c.created_at), "MMM d, HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {contributions.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No contributions found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending card charges with manual verify */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Card Charges</CardTitle>
          <CardDescription>Charges awaiting Flutterwave confirmation. Admin can manually verify.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>TX Ref</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingCharges.map(ch => (
                    <TableRow key={ch.id}>
                      <TableCell className="font-mono text-xs">{ch.tx_ref.slice(0, 20)}...</TableCell>
                      <TableCell className="font-medium">₦{ch.amount.toLocaleString()}</TableCell>
                      <TableCell>{getChargeBadge(ch.status)}</TableCell>
                      <TableCell>{ch.retry_count || 0}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">{ch.failure_reason || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(ch.created_at), "MMM d, HH:mm")}</TableCell>
                      <TableCell>
                        {(ch.status === "pending" || ch.status === "unresolved") && ch.flw_transaction_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={verifying === ch.id}
                            onClick={() => handleManualVerify(ch.id)}
                          >
                            {verifying === ch.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
                            Verify
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingCharges.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No pending charges</TableCell></TableRow>
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
