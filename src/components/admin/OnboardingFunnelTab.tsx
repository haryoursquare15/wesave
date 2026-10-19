import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Stage = { key: string; label: string; count: number };
type FunnelUser = { id: string; email: string; name: string | null; created_at: string; stuck_at: string };

const RANGES: { label: string; days: number | null }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "All time", days: null },
];

export function OnboardingFunnelTab() {
  const [days, setDays] = useState<number | null>(30);
  const [internal, setInternal] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<FunnelUser[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    supabase
      .rpc("admin_get_onboarding_funnel", { _days: days as number, _include_internal: internal })
      .then(({ data, error }) => {
        if (error) setError("Couldn't load onboarding data. Please try again.");
        const d = (data ?? {}) as { stages?: Stage[]; users?: FunnelUser[] };
        setStages(d.stages ?? []);
        setUsers(d.users ?? []);
        setLoading(false);
      });
  }, [days, internal]);

  const top = stages[0]?.count || 0;
  const stuckCounts = useMemo(() => {
    const m = new Map<string, number>();
    users.forEach((u) => m.set(u.stuck_at, (m.get(u.stuck_at) ?? 0) + 1));
    return m;
  }, [users]);
  const shown = filter ? users.filter((u) => u.stuck_at === filter) : users;
  const conversion = top ? Math.round(((stages[stages.length - 1]?.count ?? 0) / top) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Button key={r.label} size="sm" variant={days === r.days ? "default" : "outline"} onClick={() => setDays(r.days)}>
            {r.label}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={internal} onCheckedChange={setInternal} /> Include internal accounts
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Sign-up to first transaction: <span className="text-primary">{loading ? "…" : `${conversion}%`}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading
            ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            : stages.map((s, i) => {
                const pct = top ? (s.count / top) * 100 : 0;
                const prev = i > 0 ? stages[i - 1].count : s.count;
                const step = prev ? Math.round((s.count / prev) * 100) : 0;
                const lost = prev - s.count;
                return (
                  <div key={s.key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground">
                        {s.count} · {Math.round(pct)}% of sign-ups
                        {i > 0 && ` · ${step}% from previous`}
                        {i > 0 && lost > 0 && <span className="text-destructive"> · −{lost}</span>}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where users are stuck</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={filter === null ? "default" : "outline"} onClick={() => setFilter(null)}>
              All ({users.length})
            </Button>
            {[...stuckCounts.entries()].map(([k, n]) => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
                {k} ({n})
              </Button>
            ))}
          </div>
          <div className="divide-y rounded-md border">
            {shown.length === 0 && !loading && <p className="p-3 text-sm text-muted-foreground">No users in this group.</p>}
            {shown.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="font-medium">{u.name || "—"}</p>
                  <p className="text-muted-foreground">{u.email}</p>
                </div>
                <div className="text-right">
                  <Badge variant={u.stuck_at === "Fully active" ? "default" : "secondary"}>{u.stuck_at}</Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Joined {new Date(u.created_at).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
