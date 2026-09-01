import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Landmark, RefreshCw } from "lucide-react";

interface ProductAccount {
  code: string;
  name: string;
  account_number: string | null;
  is_active: boolean;
  live_balance: number | null;
  error: string | null;
  internal_principal: number;
  internal_interest: number;
  active_contracts: number;
  drift: number | null;
}

interface BalancesResponse {
  fetched_at: string;
  pool: { name: string; account_number: string; live_balance: number | null; error: string | null };
  accounts: ProductAccount[];
}

const naira = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `₦${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ProductAccountsPanel() {
  const [data, setData] = useState<BalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke("vfd-banking", {
        body: { action: "admin_product_account_balances" },
      });
      const msg = (res as { error?: string } | null)?.error || fnError?.message;
      if (msg) throw new Error(msg);
      setData(res as BalancesResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sub-account balances");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const totalLive = (data?.accounts || []).reduce((sum, a) => sum + (a.live_balance || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" /> Investment Sub-Account Balances
            </CardTitle>
            <CardDescription>
              Live bank balances for each product sub-account versus the principal held internally.
              {data?.fetched_at && ` Updated ${new Date(data.fetched_at).toLocaleTimeString()}.`}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchBalances} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Corporate Pool ({data?.pool.account_number})</p>
                <p className="text-2xl font-bold">{naira(data?.pool.live_balance)}</p>
                {data?.pool.error && <p className="text-xs text-destructive mt-1">{data.pool.error}</p>}
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Total across product sub-accounts</p>
                <p className="text-2xl font-bold">{naira(totalLive)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Live Balance</TableHead>
                    <TableHead className="text-right">Internal Principal</TableHead>
                    <TableHead className="text-right">Accrued Interest</TableHead>
                    <TableHead className="text-right">Contracts</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.accounts || []).map((a) => (
                    <TableRow key={a.code}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.account_number || "Not configured"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {naira(a.live_balance)}
                        {a.error && <div className="text-[11px] text-destructive">{a.error}</div>}
                      </TableCell>
                      <TableCell className="text-right">{naira(a.internal_principal)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{naira(a.internal_interest)}</TableCell>
                      <TableCell className="text-right">{a.active_contracts}</TableCell>
                      <TableCell className="text-right">
                        {a.drift === null ? (
                          "—"
                        ) : Math.abs(a.drift) < 1 ? (
                          <Badge variant="outline" className="text-success border-success/50">Matched</Badge>
                        ) : (
                          <Badge variant="outline" className="text-warning border-warning/50">{naira(a.drift)}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!data?.accounts?.length && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No product accounts configured</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
