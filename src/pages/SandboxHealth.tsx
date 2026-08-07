import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type FlowRow = {
  id: string;
  flow_name: string;
  status: "healthy" | "degraded" | "down" | "idle" | string;
  success_rate: number;
  last_error: string | null;
  details: Record<string, unknown> | null;
  checked_at: string;
};

const STATUS_META: Record<string, { label: string; className: string; Icon: any }> = {
  healthy: { label: "Healthy", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", Icon: CheckCircle2 },
  degraded: { label: "Degraded", className: "bg-amber-500/15 text-amber-600 border-amber-500/30", Icon: AlertTriangle },
  down: { label: "Down", className: "bg-red-500/15 text-red-600 border-red-500/30", Icon: XCircle },
  idle: { label: "Idle", className: "bg-muted text-muted-foreground border-border", Icon: MinusCircle },
};

export default function SandboxHealth() {
  const { toast } = useToast();
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("flow_health")
      .select("*")
      .order("checked_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      toast({ title: "Failed to load", description: error.message, variant: "destructive" });
      return;
    }
    setRows((data ?? []) as FlowRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  // Latest entry per flow
  const latest = useMemo(() => {
    const byFlow = new Map<string, FlowRow>();
    for (const r of rows) {
      if (!byFlow.has(r.flow_name)) byFlow.set(r.flow_name, r);
    }
    return Array.from(byFlow.values()).sort((a, b) => a.flow_name.localeCompare(b.flow_name));
  }, [rows]);

  const overall = useMemo(() => {
    if (latest.length === 0) return "idle";
    if (latest.some((r) => r.status === "down")) return "down";
    if (latest.some((r) => r.status === "degraded")) return "degraded";
    return "healthy";
  }, [latest]);

  const lastCheck = latest[0]?.checked_at;

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("sandbox-flow-healthcheck", {
        body: { source: "manual" },
      });
      if (error) throw error;
      toast({ title: "Health-check complete", description: `Overall: ${data?.overall ?? "unknown"}` });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Probe failed";
      toast({ title: "Probe failed", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const overallMeta = STATUS_META[overall] ?? STATUS_META.idle;

  return (
    <div className="min-h-[100dvh] bg-background pb-12">
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Platform Flow Health</h1>
              <p className="text-xs text-muted-foreground">
                {lastCheck
                  ? `Last check ${formatDistanceToNow(new Date(lastCheck), { addSuffix: true })}`
                  : "No checks recorded yet"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={overallMeta.className}>
              <overallMeta.Icon className="mr-1 h-3.5 w-3.5" />
              Overall: {overallMeta.label}
            </Badge>
            <Button size="sm" onClick={runNow} disabled={running}>
              <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} />
              {running ? "Running..." : "Run now"}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {loading && latest.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading flows…</CardContent></Card>
          ) : latest.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No flow health data yet. Click <strong>Run now</strong> to record a baseline.
              </CardContent>
            </Card>
          ) : (
            latest.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.idle;
              const pct = Math.round((Number(r.success_rate) || 0) * 100);
              return (
                <Card key={r.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-medium">
                        {r.flow_name.replace(/_/g, " ")}
                      </CardTitle>
                      <Badge variant="outline" className={meta.className}>
                        <meta.Icon className="mr-1 h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-semibold">{pct}%</span>
                      <span className="text-xs text-muted-foreground">success (24h)</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${
                          r.status === "healthy"
                            ? "bg-emerald-500"
                            : r.status === "degraded"
                            ? "bg-amber-500"
                            : r.status === "down"
                            ? "bg-red-500"
                            : "bg-muted-foreground/30"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {r.last_error && (
                      <p className="text-xs text-red-600 line-clamp-2">{r.last_error}</p>
                    )}
                    {r.details && (
                      <p className="text-[11px] text-muted-foreground">
                        {Object.entries(r.details)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent checks</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              <div className="space-y-1 pr-2">
                {rows.slice(0, 100).map((r) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.idle;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <meta.Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{r.flow_name}</span>
                        <Badge variant="outline" className={meta.className + " text-[10px]"}>
                          {meta.label}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(r.checked_at), { addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
