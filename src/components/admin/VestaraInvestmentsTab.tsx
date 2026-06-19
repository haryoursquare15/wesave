import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Filter, RefreshCw, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { exportToCSV } from "@/lib/exportUtils";
import { format } from "date-fns";

const PRODUCT_LABEL: Record<string, string> = {
  goalsave: "GoalSave",
  vault: "Vault",
  lockmax: "LockMax",
  upfront_yield: "Upfront Yield",
};

interface SavingsRow {
  id: string;
  user_id: string;
  product_code: string;
  principal: number;
  original_principal: number;
  user_rate: number;
  vfd_rate: number;
  tenor_days: number;
  start_date: string;
  maturity_date: string;
  accrued_interest: number;
  discounted_interest_paid: number;
  effective_rate: number | null;
  status: string;
  matured_at: string | null;
  withdrawn_at: string | null;
  penalty_amount: number;
  created_at: string;
}

interface EnrichedRow extends SavingsRow {
  customer_name: string;
  customer_username: string;
  customer_email: string;
  customer_phone: string | null;
  projected_roi: number;
  projected_vfd_roi: number;
  vestara_spread_roi: number;
}

const naira = (n: number) =>
  `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const fmtDate = (s: string | null | undefined) =>
  s ? format(new Date(s), "dd MMM yyyy") : "—";

export function VestaraInvestmentsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [product, setProduct] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [startFrom, setStartFrom] = useState<Date | undefined>();
  const [endTo, setEndTo] = useState<Date | undefined>();

  const load = async () => {
    setLoading(true);
    try {
      const { data: savings, error } = await supabase
        .from("vestara_savings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;

      const userIds = Array.from(new Set((savings || []).map(s => s.user_id)));
      let profileMap: Record<string, { full_name: string; username: string; email: string; phone: string | null }> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username, email")
          .in("id", userIds);
        profileMap = Object.fromEntries(
          (profiles || []).map(p => [p.id, {
            full_name: p.full_name || "—",
            username: (p as { username?: string }).username || "—",
            email: p.email || "—",
            phone: null,
          }])
        );
      }

      const enriched: EnrichedRow[] = (savings || []).map((s: any) => {
        const tenorFrac = Number(s.tenor_days) / 365;
        const principal = Number(s.original_principal);
        const projected_roi = +(principal * (Number(s.user_rate) / 100) * tenorFrac).toFixed(2);
        const projected_vfd_roi = +(principal * (Number(s.vfd_rate) / 100) * tenorFrac).toFixed(2);
        const p = profileMap[s.user_id];
        return {
          ...s,
          customer_name: p?.full_name || "—",
          customer_username: p?.username || "—",
          customer_email: p?.email || "—",
          customer_phone: p?.phone || null,
          projected_roi,
          projected_vfd_roi,
          vestara_spread_roi: +(projected_vfd_roi - projected_roi).toFixed(2),
        };
      });
      setRows(enriched);
    } catch (err) {
      toast({
        title: "Failed to load investments",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const fromMs = startFrom ? new Date(startFrom).setHours(0, 0, 0, 0) : null;
    const toMs = endTo ? new Date(endTo).setHours(23, 59, 59, 999) : null;
    return rows.filter(r => {
      if (product !== "all" && r.product_code !== product) return false;
      if (status !== "all" && r.status !== status) return false;
      if (fromMs !== null) {
        const sd = r.start_date ? new Date(r.start_date).getTime() : 0;
        if (sd < fromMs) return false;
      }
      if (toMs !== null) {
        const md = r.maturity_date ? new Date(r.maturity_date).getTime() : 0;
        if (md > toMs) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.customer_name.toLowerCase().includes(q) &&
          !r.customer_username.toLowerCase().includes(q) &&
          !r.customer_email.toLowerCase().includes(q) &&
          !(r.customer_phone || "").toLowerCase().includes(q) &&
          !r.user_id.toLowerCase().includes(q) &&
          !r.id.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rows, product, status, search, startFrom, endTo]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.principal += Number(r.original_principal);
        acc.user_roi += r.projected_roi;
        acc.vfd_roi += r.projected_vfd_roi;
        acc.spread += r.vestara_spread_roi;
        return acc;
      },
      { principal: 0, user_roi: 0, vfd_roi: 0, spread: 0 }
    );
  }, [filtered]);

  const handleExport = () => {
    if (!filtered.length) {
      toast({ title: "Nothing to export" });
      return;
    }
    const data = filtered.map(r => ({
      subscription_id: r.id,
      customer_id: r.user_id,
      customer_username: r.customer_username,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      customer_phone: r.customer_phone || "",
      investment_type: PRODUCT_LABEL[r.product_code] || r.product_code,
      product_code: r.product_code,
      principal_ngn: Number(r.original_principal),
      current_principal_ngn: Number(r.principal),
      tenor_days: r.tenor_days,
      start_date: fmtDate(r.start_date),
      end_date: fmtDate(r.maturity_date),
      user_rate_pct: Number(r.user_rate),
      vfd_rate_pct: Number(r.vfd_rate),
      vestara_spread_pct: +(Number(r.vfd_rate) - Number(r.user_rate)).toFixed(3),
      projected_roi_to_customer_ngn: r.projected_roi,
      projected_vfd_roi_ngn: r.projected_vfd_roi,
      vestara_spread_roi_ngn: r.vestara_spread_roi,
      accrued_interest_ngn: Number(r.accrued_interest),
      discounted_interest_paid_ngn: Number(r.discounted_interest_paid),
      effective_rate_pct: r.effective_rate ? Number(r.effective_rate) : "",
      penalty_amount_ngn: Number(r.penalty_amount),
      status: r.status,
      matured_at: fmtDate(r.matured_at),
      withdrawn_at: fmtDate(r.withdrawn_at),
      created_at: fmtDate(r.created_at),
    }));
    exportToCSV(data, "vestara_investment_subscriptions");
    toast({ title: "Export ready", description: `${data.length} subscriptions exported.` });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle>Investment Subscriptions (Audit Trail)</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Every Vestara savings subscription with snapshotted user/VFD rates, ROI, and lifecycle dates. Download for audit, treasury reconciliation, and regulatory reporting.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={handleExport} className="gap-1">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox label="Subscriptions" value={filtered.length.toString()} />
          <StatBox label="Total Principal" value={naira(totals.principal)} />
          <StatBox label="Customer ROI (projected)" value={naira(totals.user_roi)} />
          <StatBox label="Vestara Spread (projected)" value={naira(totals.spread)} />
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by username, name, email, phone, customer/subscription id"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-1 justify-start font-normal", !startFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4" />
                {startFrom ? `Start ≥ ${format(startFrom, "dd MMM yyyy")}` : "Start date from"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={startFrom} onSelect={setStartFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
              {startFrom && (
                <div className="p-2 border-t">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setStartFrom(undefined)}>Clear</Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-1 justify-start font-normal", !endTo && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4" />
                {endTo ? `End ≤ ${format(endTo, "dd MMM yyyy")}` : "End date to"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={endTo} onSelect={setEndTo} initialFocus className={cn("p-3 pointer-events-auto")} />
              {endTo && (
                <div className="p-2 border-t">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setEndTo(undefined)}>Clear</Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="goalsave">GoalSave</SelectItem>
                <SelectItem value="vault">Vault</SelectItem>
                <SelectItem value="lockmax">LockMax</SelectItem>
                <SelectItem value="upfront_yield">Upfront Yield</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="matured">Matured</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            No investment subscriptions match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead>Tenor</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>User %</TableHead>
                  <TableHead>VFD %</TableHead>
                  <TableHead>Customer ROI</TableHead>
                  <TableHead>Spread ROI</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{r.customer_name}</div>
                      <div className="text-xs text-muted-foreground">@{r.customer_username}</div>
                      <div className="text-xs text-muted-foreground">{r.customer_email}</div>
                      <div className="text-xs text-muted-foreground">{r.customer_phone || "—"}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{r.user_id.slice(0, 8)}…</div>
                    </TableCell>
                    <TableCell>{PRODUCT_LABEL[r.product_code] || r.product_code}</TableCell>
                    <TableCell>{naira(Number(r.original_principal))}</TableCell>
                    <TableCell>{r.tenor_days}d</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.maturity_date)}</TableCell>
                    <TableCell>{Number(r.user_rate)}%</TableCell>
                    <TableCell>{Number(r.vfd_rate)}%</TableCell>
                    <TableCell>{naira(r.projected_roi)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{naira(r.vestara_spread_roi)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "active" ? "default" : "outline"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 200 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Showing first 200 of {filtered.length} — export CSV for the full dataset.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-1 truncate">{value}</p>
    </div>
  );
}
