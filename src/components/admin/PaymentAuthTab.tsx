import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { RefreshCw, CreditCard, ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";

interface CardToken {
  id: string;
  user_id: string;
  card_last4: string | null;
  card_type: string | null;
  card_expiry: string | null;
  card_status: string;
  first_6digits: string | null;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

export function PaymentAuthTab() {
  const [tokens, setTokens] = useState<CardToken[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("card_tokens")
        .select("id, user_id, card_last4, card_type, card_expiry, card_status, first_6digits, group_id, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setTokens(data || []);
    } catch (err) {
      console.error("Error fetching tokens:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTokens(); }, []);

  const stats = {
    active: tokens.filter(t => t.card_status === "active").length,
    expired: tokens.filter(t => t.card_status === "expired").length,
    revoked: tokens.filter(t => t.card_status === "revoked").length,
    pending: tokens.filter(t => t.card_status === "pending").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-success/10 text-success border-success/20"><ShieldCheck className="h-3 w-3 mr-1" />Active</Badge>;
      case "expired": return <Badge className="bg-warning/10 text-warning border-warning/20"><ShieldAlert className="h-3 w-3 mr-1" />Expired</Badge>;
      case "revoked": return <Badge variant="destructive"><ShieldOff className="h-3 w-3 mr-1" />Revoked</Badge>;
      case "pending": return <Badge variant="outline">Pending</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-success">{stats.active}</div><div className="text-xs text-muted-foreground">Active Tokens</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-warning">{stats.expired}</div><div className="text-xs text-muted-foreground">Expired</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-destructive">{stats.revoked}</div><div className="text-xs text-muted-foreground">Revoked</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-muted-foreground">{stats.pending}</div><div className="text-xs text-muted-foreground">Pending</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment Authorization Tokens</CardTitle>
              <CardDescription>Card tokens stored for recurring charges</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchTokens}><RefreshCw className="h-4 w-4" /></Button>
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
                    <TableHead>Card</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.user_id.slice(0, 8)}...</TableCell>
                      <TableCell className="font-mono">{t.first_6digits ? `${t.first_6digits}••••${t.card_last4}` : `••••${t.card_last4 || "????"}` }</TableCell>
                      <TableCell className="capitalize">{t.card_type || "—"}</TableCell>
                      <TableCell>{getStatusBadge(t.card_status)}</TableCell>
                      <TableCell className="font-mono text-xs">{t.group_id ? `${t.group_id.slice(0,8)}...` : "Global"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(t.created_at), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                  {tokens.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No card tokens found</TableCell></TableRow>
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
