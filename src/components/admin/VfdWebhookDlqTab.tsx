import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, RotateCw, CheckCircle2, PlayCircle, AlertTriangle } from "lucide-react";

interface DlqRow {
  id: string;
  event_type: string | null;
  reference: string | null;
  payload: Record<string, unknown>;
  error: string | null;
  attempts: number;
  resolved: boolean;
  last_attempt_at: string;
  created_at: string;
}

interface SweepResult {
  scanned: number;
  committed: number;
  reversed: number;
  still_pending: number;
  errors: string[];
}

export function VfdWebhookDlqTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DlqRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [lastSweep, setLastSweep] = useState<SweepResult | null>(null);

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

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const data = await invoke({ action: "dlq_list", limit: 100 });
    setRows((data?.data as DlqRow[]) ?? []);
    setLoading(false);
  }, [invoke]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const replay = async (id: string) => {
    setBusyId(id);
    const data = await invoke({ action: "dlq_replay", id });
    setBusyId(null);
    if (data) {
      toast({ title: "Replayed", description: JSON.stringify(data?.data ?? {}) });
      fetchRows();
    }
  };

  const resolve = async (id: string) => {
    setBusyId(id);
    const data = await invoke({ action: "dlq_resolve", id });
    setBusyId(null);
    if (data) {
      toast({ title: "Marked resolved" });
      fetchRows();
    }
  };

  const runSweep = async () => {
    setSweeping(true);
    const data = await invoke({ action: "reconciliation_sweep", olderThanMinutes: 5, limit: 100 });
    setSweeping(false);
    if (data?.data) {
      setLastSweep(data.data as SweepResult);
      toast({
        title: "Reconciliation done",
        description: `Scanned ${data.data.scanned}, committed ${data.data.committed}, reversed ${data.data.reversed}, still pending ${data.data.still_pending}`,
      });
      fetchRows();
    }
  };

  const pending = rows.filter((r) => !r.resolved);
  const resolved = rows.filter((r) => r.resolved);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Webhook DLQ &amp; Reconciliation
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Failed webhooks awaiting replay, and on-demand sweep for stuck reservations.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={runSweep} disabled={sweeping}>
              <PlayCircle className={`h-4 w-4 ${sweeping ? "animate-pulse" : ""}`} />
              {sweeping ? "Sweeping…" : "Run reconciliation"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {lastSweep && (
            <div className="rounded-md border p-3 text-sm grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Scanned" value={lastSweep.scanned} />
              <Stat label="Committed" value={lastSweep.committed} tone="success" />
              <Stat label="Reversed" value={lastSweep.reversed} tone="destructive" />
              <Stat label="Still pending" value={lastSweep.still_pending} tone="muted" />
              {lastSweep.errors?.length > 0 && (
                <div className="col-span-full text-xs text-destructive break-words">
                  Errors: {lastSweep.errors.join("; ")}
                </div>
              )}
            </div>
          )}

          <Section title={`Pending (${pending.length})`}>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending DLQ entries 🎉</p>
            ) : (
              pending.map((row) => (
                <DlqRowCard
                  key={row.id}
                  row={row}
                  busy={busyId === row.id}
                  onReplay={() => replay(row.id)}
                  onResolve={() => resolve(row.id)}
                />
              ))
            )}
          </Section>

          <Section title={`Resolved (${resolved.length})`} collapsedByDefault>
            {resolved.map((row) => (
              <DlqRowCard key={row.id} row={row} busy={false} />
            ))}
          </Section>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "destructive" | "muted" }) {
  const cls =
    tone === "success" ? "text-success" :
    tone === "destructive" ? "text-destructive" :
    tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function Section({ title, children, collapsedByDefault }: { title: string; children: React.ReactNode; collapsedByDefault?: boolean }) {
  const [open, setOpen] = useState(!collapsedByDefault);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium mb-2 hover:underline"
      >
        {open ? "▾" : "▸"} {title}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

function DlqRowCard({
  row,
  busy,
  onReplay,
  onResolve,
}: {
  row: DlqRow;
  busy: boolean;
  onReplay?: () => void;
  onResolve?: () => void;
}) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={row.resolved ? "secondary" : "destructive"}>
            {row.resolved ? "resolved" : "pending"}
          </Badge>
          <span className="text-sm font-medium">{row.event_type ?? "unknown"}</span>
          {row.reference && (
            <span className="text-xs text-muted-foreground font-mono">{row.reference}</span>
          )}
          <span className="text-xs text-muted-foreground">attempts: {row.attempts}</span>
        </div>
        {!row.resolved && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onReplay} disabled={busy}>
              <RotateCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Replay
            </Button>
            <Button size="sm" variant="ghost" onClick={onResolve} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" />
              Resolve
            </Button>
          </div>
        )}
      </div>
      {row.error && <p className="text-xs text-destructive">{row.error}</p>}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Payload</summary>
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px]">
          {JSON.stringify(row.payload, null, 2)}
        </pre>
      </details>
      <p className="text-[10px] text-muted-foreground">
        last attempt: {new Date(row.last_attempt_at).toLocaleString()} · created: {new Date(row.created_at).toLocaleString()}
      </p>
    </div>
  );
}
