import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { RefreshCw, CreditCard, ShieldCheck, ShieldAlert, ShieldOff, Repeat } from "lucide-react";

interface PaymentAuthRow {
  id: string;
  user_id: string;
  label: string;
  detail: string;
  kind: "card" | "virtual_card" | "recurring_mandate";
  status: string;
  group_id?: string | null;
  created_at: string;
  source: "legacy" | "sandbox";
}

export function PaymentAuthTab() {
  const [rows, setRows] = useState<PaymentAuthRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tokensRes, virtualRes, mandatesRes] = await Promise.all([
        supabase.rpc("admin_list_card_tokens" as any, { _limit: 200 }),
        supabase
          .from("vfd_sandbox_virtual_cards")
          .select("id, user_id, masked_pan, status, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("vfd_sandbox_recurring_bills")
          .select("id, user_id, nickname, biller_name, amount, frequency, status, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const merged: PaymentAuthRow[] = [];
      (((tokensRes as any).data as any[]) ?? []).forEach((t: any) => merged.push({
        id: t.id, user_id: t.user_id,
        label: `••••${t.card_last4 || "????"}`,
        detail: t.card_type || "—",
        kind: "card", status: t.card_status, group_id: t.group_id,
        created_at: t.created_at, source: "legacy",
      }));
      (virtualRes.data ?? []).forEach((v: any) => merged.push({
        id: v.id, user_id: v.user_id,
        label: v.masked_pan || "Virtual card",
        detail: "VFD virtual",
        kind: "virtual_card", status: v.status,
        created_at: v.created_at, source: "sandbox",
      }));
      (mandatesRes.data ?? []).forEach((r: any) => merged.push({
        id: r.id, user_id: r.user_id,
        label: r.nickname || r.biller_name || "Recurring bill",
        detail: `₦${Number(r.amount || 0).toLocaleString()} / ${r.frequency}`,
        kind: "recurring_mandate", status: r.status,
        created_at: r.created_at, source: "sandbox",
      }));
      merged.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      setRows(merged);
    } catch (err) {
      console.error("Error fetching payment auth data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const stats = {
    active: rows.filter(r => r.status === "active").length,
    expired: rows.filter(r => r.status === "expired").length,
    revoked: rows.filter(r => r.status === "revoked" || r.status === "blocked").length,
    pending: rows.filter(r => r.status === "pending" || r.status === "paused").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-success/10 text-success border-success/20"><ShieldCheck className="h-3 w-3 mr-1" />Active</Badge>;
      case "expired": return <Badge className="bg-warning/10 text-warning border-warning/20"><ShieldAlert className="h-3 w-3 mr-1" />Expired</Badge>;
      case "revoked":
      case "blocked": return <Badge variant="destructive"><ShieldOff className="h-3 w-3 mr-1" />{status}</Badge>;
      case "pending":
      case "paused": return <Badge variant="outline">{status}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getKindBadge = (kind: PaymentAuthRow["kind"]) => {
    switch (kind) {
      case "card": return <Badge variant="outline" className="text-[10px]"><CreditCard className="h-3 w-3 mr-1" />Card</Badge>;
      case "virtual_card": return <Badge variant="outline" className="text-[10px]"><CreditCard className="h-3 w-3 mr-1" />Virtual</Badge>;
      case "recurring_mandate": return <Badge variant="outline" className="text-[10px]"><Repeat className="h-3 w-3 mr-1" />Mandate</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-success">{stats.active}</div><div className="text-xs text-muted-foreground">Active</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-warning">{stats.expired}</div><div className="text-xs text-muted-foreground">Expired</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-destructive">{stats.revoked}</div><div className="text-xs text-muted-foreground">Revoked/Blocked</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-muted-foreground">{stats.pending}</div><div className="text-xs text-muted-foreground">Pending/Paused</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment Authorizations</CardTitle>
              <CardDescription>Card tokens, VFD virtual cards, and recurring-bill mandates</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAll}><RefreshCw className="h-4 w-4" /></Button>
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
                    <TableHead>Kind</TableHead>
                    <TableHead>Identifier</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={`${r.source}-${r.kind}-${r.id}`}>
                      <TableCell className="font-mono text-xs">{r.user_id.slice(0, 8)}...</TableCell>
                      <TableCell>{getKindBadge(r.kind)}</TableCell>
                      <TableCell className="font-mono text-sm">{r.label}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.detail}</TableCell>
                      <TableCell>{getStatusBadge(r.status)}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{r.source}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No payment authorizations found</TableCell></TableRow>
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
