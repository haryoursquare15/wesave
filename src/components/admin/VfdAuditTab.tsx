import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Activity, ScanLine, RefreshCw, Search, AlertTriangle } from "lucide-react";

interface DriftRow {
  id: string;
  user_id: string | null;
  vfd_account_number: string | null;
  vfd_live_balance: number;
  recorded_balance: number;
  drift: number;
  threshold: number;
  is_healthy: boolean;
  resolved: boolean;
  checked_at: string;
}

interface TxEvent {
  id: string;
  transaction_id: string | null;
  user_id: string | null;
  reference: string | null;
  event_type: string;
  actor: string;
  from_status: string | null;
  to_status: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export function VfdAuditTab() {
  const { toast } = useToast();
  const [drifts, setDrifts] = useState<DriftRow[]>([]);
  const [loadingDrifts, setLoadingDrifts] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [onlyUnhealthy, setOnlyUnhealthy] = useState(true);

  const [refQuery, setRefQuery] = useState("");
  const [events, setEvents] = useState<TxEvent[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const invoke = useCallback(
    async (body: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("vfd-banking", { body });
      if (error) {
        toast({ title: "Request failed", description: error.message, variant: "destructive" });
        return null;
      }
      return data;
    },
    [toast],
  );

  const fetchDrifts = useCallback(async () => {
    setLoadingDrifts(true);
    const data = await invoke({ action: "drift_findings", limit: 100, onlyUnhealthy });
    setDrifts((data?.data as DriftRow[]) ?? []);
    setLoadingDrifts(false);
  }, [invoke, onlyUnhealthy]);

  useEffect(() => {
    fetchDrifts();
  }, [fetchDrifts]);

  const runSweep = async () => {
    setSweeping(true);
    const data = await invoke({ action: "drift_sweep", sinceMinutes: 120, threshold: 1, limit: 200 });
    setSweeping(false);
    if (data?.data) {
      const r = data.data as { checked: number; healthy: number; drifted: number };
      toast({
        title: "Drift sweep complete",
        description: `Checked ${r.checked}, healthy ${r.healthy}, drifted ${r.drifted}`,
      });
      fetchDrifts();
    }
  };

  const lookupEvents = async () => {
    if (!refQuery.trim()) return;
    setLoadingEvents(true);
    setEvents(null);
    const data = await invoke({ action: "tx_events", reference: refQuery.trim() });
    setEvents((data?.data as TxEvent[]) ?? []);
    setLoadingEvents(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              Balance drift findings
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Live VFD balance vs internal recorded balance — flagged when |drift| exceeds threshold.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOnlyUnhealthy((v) => !v)}>
              {onlyUnhealthy ? "Showing: unhealthy only" : "Showing: all"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchDrifts} disabled={loadingDrifts}>
              <RefreshCw className={`h-4 w-4 ${loadingDrifts ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={runSweep} disabled={sweeping}>
              <ScanLine className={`h-4 w-4 ${sweeping ? "animate-pulse" : ""}`} />
              {sweeping ? "Sweeping…" : "Run drift sweep"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingDrifts ? (
            <Skeleton className="h-24 w-full" />
          ) : drifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No findings.</p>
          ) : (
            drifts.map((d) => (
              <div key={d.id} className="rounded-md border p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={d.is_healthy ? "secondary" : "destructive"}>
                    {d.is_healthy ? "healthy" : "drift"}
                  </Badge>
                  <span className="font-mono text-xs">{d.vfd_account_number}</span>
                  <span className="text-xs text-muted-foreground">{new Date(d.checked_at).toLocaleString()}</span>
                </div>
                <div className="text-xs grid grid-cols-3 gap-3 text-right">
                  <div>
                    <div className="text-muted-foreground">Live</div>
                    <div className="font-medium">₦{Number(d.vfd_live_balance).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Recorded</div>
                    <div className="font-medium">₦{Number(d.recorded_balance).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Drift</div>
                    <div className={`font-medium ${d.is_healthy ? "" : "text-destructive"}`}>
                      ₦{Number(d.drift).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Transaction event timeline
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Look up a transaction reference to see every state change (reserved → committed/reversed, webhook, reconciliation).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Transaction reference (e.g. Vestara-transfer-…)"
              value={refQuery}
              onChange={(e) => setRefQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupEvents()}
            />
            <Button onClick={lookupEvents} disabled={loadingEvents || !refQuery.trim()}>
              <Search className="h-4 w-4" />
              Lookup
            </Button>
          </div>

          {loadingEvents ? (
            <Skeleton className="h-32 w-full" />
          ) : events === null ? (
            <p className="text-sm text-muted-foreground">Enter a reference and press Lookup.</p>
          ) : events.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> No events recorded for that reference.
            </div>
          ) : (
            <ol className="relative border-l ml-2 space-y-3">
              {events.map((ev) => (
                <li key={ev.id} className="ml-4">
                  <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{ev.event_type}</Badge>
                    <span className="text-xs text-muted-foreground">by {ev.actor}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ev.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {ev.from_status ?? "—"} → {ev.to_status ?? "—"}
                  </div>
                  {Object.keys(ev.payload ?? {}).length > 0 && (
                    <details className="text-xs mt-1">
                      <summary className="cursor-pointer text-muted-foreground">payload</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
