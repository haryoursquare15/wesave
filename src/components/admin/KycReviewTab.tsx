import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Loader2, RefreshCw, ScanFace, Search } from "lucide-react";
import { getUserFriendlyError } from "@/lib/errorMessages";
import { KycReviewDetail } from "./KycReviewDetail";

interface Submission {
  user_id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  submitted_at: string | null;
  document_types: string[];
  document_count: number;
  current_tier: string | null;
  requested_tier: number | null;
  account_status: string | null;
  review_status: "pending" | "approved" | "rejected";
  review_reason: string | null;
  reviewed_at: string | null;
}

const DOC_LABELS: Record<string, string> = {
  government_id: "ID",
  utility_bill: "Utility bill",
  passport_photograph: "Photo",
};

const AGING_HOURS = 24;

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export function KycReviewTab() {
  const { toast } = useToast();
  const { hasPermission, userRoles } = useAdminPermissions();
  const canDecide = hasPermission("compliance.restrict") || userRoles.includes("super_admin");

  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Submission[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-kyc-review", {
      body: { action: "list_submissions", status },
    });
    setLoading(false);

    if (error || (data as { error?: string })?.error) {
      toast({
        title: "Could not load KYC submissions",
        description: getUserFriendlyError((data as { error?: string })?.error || error?.message),
        variant: "destructive",
      });
      return;
    }

    setItems((data as { submissions: Submission[] }).submissions || []);
    setCounts((data as { counts: typeof counts }).counts);
  }, [status, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const term = search.trim().toLowerCase();
  const visible = term
    ? items.filter((i) =>
        [i.full_name, i.username, i.email].some((v) => (v || "").toLowerCase().includes(term)),
      )
    : items;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanFace className="h-5 w-5 text-primary" />
          KYC review
          {counts.pending > 0 && <Badge variant="secondary">{counts.pending} pending</Badge>}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <TabsList>
              <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
              <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, username or email"
              className="pl-9"
            />
          </div>
        </div>

        {!loading && visible.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No {status === "all" ? "" : status} submissions.
          </p>
        )}

        <div className="space-y-2">
          {visible.map((s) => {
            const aged = s.review_status === "pending" && (hoursSince(s.submitted_at) ?? 0) > AGING_HOURS;
            return (
              <button
                key={s.user_id}
                onClick={() => setSelected(s.user_id)}
                className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50 min-h-11"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.full_name || "Unnamed customer"}
                      {s.username && (
                        <span className="ml-1 text-xs text-muted-foreground">@{s.username}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{s.email || "—"}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.requested_tier ? <Badge variant="outline">Tier {s.requested_tier}</Badge> : null}
                    {s.document_types.map((t, i) => (
                      <Badge key={`${t}-${i}`} variant="outline">
                        {DOC_LABELS[t] || t}
                      </Badge>
                    ))}
                    <Badge
                      variant={
                        s.review_status === "approved"
                          ? "default"
                          : s.review_status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {s.review_status}
                    </Badge>
                  </div>
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Submitted{" "}
                  {s.submitted_at ? new Date(s.submitted_at).toLocaleString("en-NG") : "—"}
                  {aged && (
                    <span className="font-medium text-destructive">
                      · waiting over {AGING_HOURS}h
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {!canDecide && (
          <p className="text-xs text-muted-foreground">
            You can view submissions but not approve or reject them.
          </p>
        )}
      </CardContent>

      <KycReviewDetail
        userId={selected}
        canDecide={canDecide}
        onOpenChange={(open) => !open && setSelected(null)}
        onReviewed={() => void load()}
      />
    </Card>
  );
}
