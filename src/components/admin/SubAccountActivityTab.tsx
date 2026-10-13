import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Copy } from "lucide-react";
import { ProductAccountsPanel } from "./ProductAccountsPanel";
import { useToast } from "@/hooks/use-toast";

const PRODUCT_LABEL: Record<string, string> = {
  goalsave: "Goal Savings", vault: "Vault", lockmax: "LockMax", upfront_yield: "Upfront Yield",
};

interface Movement {
  key: string;
  at: string;
  product: string;
  savingsId: string;
  userId: string;
  amount: number;
  direction: "in" | "out";
  kind: string;
  reference: string | null;
  approval: string;
  planStatus: string;
}

const naira = (v: number) => `₦${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function approvalBadge(s: string) {
  const cls =
    s === "approved" ? "text-success border-success/50"
      : s === "rejected" ? "text-destructive border-destructive/50"
        : "text-warning border-warning/50";
  return <Badge variant="outline" className={`capitalize ${cls}`}>{s}</Badge>;
}

export function SubAccountActivityTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Movement[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState("all");
  const [approval, setApproval] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [savRes, schedRes, usersRes, clientsRes] = await Promise.all([
        supabase.from("vestara_savings")
          .select("id,user_id,product_code,principal,original_principal,status,approval_status,sub_account_transfer_ref,sub_account_transferred_at,subaccount_funded_at,sub_account_reversal_ref,sub_account_reversed_at,created_at")
          .order("created_at", { ascending: false }).limit(1000),
        supabase.from("vfd_savings_debit_schedule")
          .select("id,savings_id,user_id,amount,status,vfd_reference,collected_at,subaccount_sweep_ref,swept_to_subaccount_at")
          .eq("status", "succeeded").limit(1000),
        supabase.rpc("admin_get_all_users"),
        supabase.rpc("get_vfd_clients_redacted"),
      ]);
      if (savRes.error) throw savRes.error;

      const nm: Record<string, string> = {};
      ((usersRes.data as { id: string; full_name: string | null; email: string | null }[]) || [])
        .forEach(u => { nm[u.id] = u.full_name || u.email || ""; });
      ((clientsRes.data as { user_id: string; full_name: string | null }[]) || [])
        .forEach(c => { if (c.full_name) nm[c.user_id] = c.full_name; });
      setNames(nm);

      const savings = savRes.data || [];
      const byId = new Map(savings.map(s => [s.id, s]));
      const out: Movement[] = [];
      for (const s of savings) {
        const base = {
          product: s.product_code as string, savingsId: s.id, userId: s.user_id,
          approval: (s.approval_status as string) || "pending", planStatus: s.status as string,
        };
        const amt = Number(s.original_principal ?? s.principal ?? 0);
        if (s.sub_account_transfer_ref) {
          out.push({ ...base, key: `${s.id}-in`, at: s.subaccount_funded_at || s.sub_account_transferred_at || s.created_at,
            amount: amt, direction: "in", kind: "Plan funding", reference: s.sub_account_transfer_ref });
        }
        if (s.sub_account_reversal_ref) {
          out.push({ ...base, key: `${s.id}-out`, at: s.sub_account_reversed_at || s.created_at,
            amount: amt, direction: "out", kind: "Reversal / refund", reference: s.sub_account_reversal_ref });
        }
      }
      for (const d of schedRes.data || []) {
        const s = byId.get(d.savings_id);
        out.push({
          key: `deb-${d.id}`, at: d.swept_to_subaccount_at || d.collected_at || "",
          product: (s?.product_code as string) || "goalsave", savingsId: d.savings_id, userId: d.user_id,
          amount: Number(d.amount || 0), direction: "in",
          kind: d.subaccount_sweep_ref ? "Direct debit (swept)" : "Direct debit (not yet swept)",
          reference: d.subaccount_sweep_ref || d.vfd_reference,
          approval: (s?.approval_status as string) || "approved", planStatus: (s?.status as string) || "",
        });
      }
      out.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
      setRows(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sub-account activity");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(r =>
      (product === "all" || r.product === product) &&
      (approval === "all" || r.approval === approval) &&
      (!term || [r.reference, r.savingsId, names[r.userId]].some(v => (v || "").toLowerCase().includes(term))));
  }, [rows, product, approval, q, names]);

  const totals = useMemo(() => {
    const t: Record<string, { in: number; out: number }> = {};
    for (const r of rows) {
      t[r.product] ??= { in: 0, out: 0 };
      t[r.product][r.direction] += r.amount;
    }
    return t;
  }, [rows]);

  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast({ title: "Copied" }); };

  return (
    <div className="space-y-6">
      <ProductAccountsPanel />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.keys(PRODUCT_LABEL).map(code => (
          <Card key={code}>
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{PRODUCT_LABEL[code]}</p>
              <p className="text-sm"><span className="text-success font-semibold">In {naira(totals[code]?.in || 0)}</span></p>
              <p className="text-sm"><span className="text-destructive font-semibold">Out {naira(totals[code]?.out || 0)}</span></p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Sub-Account Money Movement</CardTitle>
              <CardDescription>Every transfer into and out of each savings product sub-account, with customer, plan and approval status.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-3">
            <Input placeholder="Search reference, plan ID or customer" value={q} onChange={e => setQ(e.target.value)} className="sm:max-w-xs" />
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {Object.entries(PRODUCT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={approval} onValueChange={setApproval}>
              <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Movement</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subscription ID</TableHead>
                    <TableHead>Approval</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.key}>
                      <TableCell className="text-xs whitespace-nowrap">{r.at ? new Date(r.at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" }) : "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{names[r.userId] || r.userId.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm">{PRODUCT_LABEL[r.product] || r.product}</TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1">
                          {r.direction === "in"
                            ? <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                            : <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />}
                          {r.kind}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${r.direction === "in" ? "text-success" : "text-destructive"}`}>
                        {r.direction === "in" ? "+" : "−"}{naira(r.amount)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {r.reference ? (
                          <button onClick={() => copy(r.reference!)} className="inline-flex items-center gap-1 hover:text-primary">
                            {r.reference} <Copy className="h-3 w-3" />
                          </button>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        <button onClick={() => copy(r.savingsId)} className="inline-flex items-center gap-1 hover:text-primary">
                          {r.savingsId.slice(0, 8)} <Copy className="h-3 w-3" />
                        </button>
                      </TableCell>
                      <TableCell>{approvalBadge(r.approval)}</TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No movements found</TableCell></TableRow>
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
