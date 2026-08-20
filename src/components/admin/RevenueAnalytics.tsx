import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, RefreshCw, TrendingUp, Banknote, Coins } from "lucide-react";
import { format } from "date-fns";
import { exportToCSV } from "@/lib/exportUtils";
import {
  REVENUE_SOURCE_LABELS,
  useRevenueAnalytics,
  type RevenueRange,
} from "@/hooks/useRevenueAnalytics";

const RANGES: { value: RevenueRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

const naira = (n: number) =>
  `₦${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function RevenueAnalytics() {
  const [range, setRange] = useState<RevenueRange>("30d");
  const [includeInternal, setIncludeInternal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const { breakdown, entries, loading, entriesLoading, fetchBreakdown, fetchEntries } =
    useRevenueAnalytics();

  useEffect(() => {
    fetchBreakdown(range, includeInternal);
    fetchEntries(range, includeInternal, selectedSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, includeInternal, selectedSource]);

  const sources = breakdown?.sources ?? [];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              size="sm"
              variant={range === r.value ? "default" : "outline"}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="include-internal"
            checked={includeInternal}
            onCheckedChange={setIncludeInternal}
          />
          <Label htmlFor="include-internal" className="text-sm">
            Include internal/test accounts
          </Label>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            fetchBreakdown(range, includeInternal);
            fetchEntries(range, includeInternal, selectedSource);
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recognised revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">{naira(breakdown?.total ?? 0)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Excludes {naira(breakdown?.excluded_internal_total ?? 0)} from internal accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Swept to pool</CardTitle>
            <Banknote className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {naira(breakdown?.swept_total ?? 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Real cash in the corporate pool</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unswept float</CardTitle>
            <Coins className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold text-amber-600">
                {naira(breakdown?.unswept_float ?? 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Still in customer sub-accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* Source breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue by source</CardTitle>
          <CardDescription>Click a source to see the transactions behind it</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No revenue in this period</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sources.map((s) => (
                <button
                  key={s.source}
                  onClick={() => setSelectedSource(selectedSource === s.source ? null : s.source)}
                  className={`text-left rounded-lg border p-3 transition-colors min-h-[44px] hover:bg-accent ${
                    selectedSource === s.source ? "border-primary bg-accent" : ""
                  }`}
                >
                  <div className="text-xs text-muted-foreground">
                    {REVENUE_SOURCE_LABELS[s.source] ?? s.source}
                  </div>
                  <div className="text-lg font-semibold">{naira(s.amount)}</div>
                  <div className="text-xs text-muted-foreground">{s.count} transactions</div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill-down */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>
              {selectedSource
                ? REVENUE_SOURCE_LABELS[selectedSource] ?? selectedSource
                : "All revenue transactions"}
            </CardTitle>
            <CardDescription>
              {entries.length} entries{selectedSource ? " — click the source card again to clear" : ""}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!entries.length}
            onClick={() =>
              exportToCSV(
                entries.map((e) => ({
                  Date: format(new Date(e.created_at), "yyyy-MM-dd HH:mm:ss"),
                  Source: REVENUE_SOURCE_LABELS[e.source] ?? e.source,
                  Amount: e.amount,
                  User: e.full_name || e.email || "—",
                  Username: e.username ? `@${e.username}` : "",
                  Reference: e.reference || "",
                  Internal: e.internal_account ? "yes" : "no",
                })),
                "revenue_transactions"
              )
            }
          >
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </CardHeader>
        <CardContent>
          {entriesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No transactions</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Fee type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={`${e.transaction_id}-${e.created_at}`}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(e.created_at), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{e.full_name || e.email || "—"}</div>
                        {e.username && (
                          <div className="text-xs text-muted-foreground">@{e.username}</div>
                        )}
                        {e.internal_account && (
                          <Badge variant="outline" className="mt-1">
                            internal
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {REVENUE_SOURCE_LABELS[e.source] ?? e.source}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[220px] truncate text-xs text-muted-foreground"
                        title={e.reference || undefined}
                      >
                        {e.reference || "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {naira(e.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
