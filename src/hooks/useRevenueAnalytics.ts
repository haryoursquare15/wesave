import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RevenueRange = "today" | "7d" | "30d" | "all";

export interface RevenueSourceRow {
  source: string;
  amount: number;
  count: number;
}

export interface RevenueBreakdown {
  total: number;
  sources: RevenueSourceRow[];
  excluded_internal_total: number;
  swept_total: number;
  unswept_float: number;
}

export interface RevenueEntry {
  transaction_id: string;
  reference: string | null;
  source: string;
  amount: number;
  user_id: string | null;
  full_name: string | null;
  username: string | null;
  email: string | null;
  internal_account: boolean;
  created_at: string;
}

export const REVENUE_SOURCE_LABELS: Record<string, string> = {
  bills_convenience_fee: "Bills convenience fees",
  biller_discount: "Biller discount (VFD margin)",
  transfer_fee: "Transfer fees",
  stamp_duty: "Stamp duty",
  splitpay_service_fee: "Split Pay service fees",
  mandate_setup_fee: "Mandate setup fees (Ajo / GoalSave)",
  early_withdrawal_penalty: "Early-withdrawal penalties",
  other: "Other / unclassified",
};

export function rangeToStart(range: RevenueRange): string | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function useRevenueAnalytics() {
  const [breakdown, setBreakdown] = useState<RevenueBreakdown | null>(null);
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBreakdown = useCallback(async (range: RevenueRange, includeInternal: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await (supabase.rpc as any)("admin_get_revenue_breakdown", {
        _start: rangeToStart(range),
        _end: null,
        _include_internal: includeInternal,
      });
      if (rpcError) throw rpcError;
      setBreakdown(data as unknown as RevenueBreakdown);
    } catch (err) {
      console.error("Error fetching revenue breakdown:", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEntries = useCallback(
    async (range: RevenueRange, includeInternal: boolean, source: string | null) => {
      setEntriesLoading(true);
      try {
        const { data, error: rpcError } = await (supabase.rpc as any)("admin_list_revenue_entries", {
          _start: rangeToStart(range),
          _end: null,
          _source: source,
          _include_internal: includeInternal,
          _limit: 500,
        });
        if (rpcError) throw rpcError;
        setEntries((data as unknown as RevenueEntry[]) || []);
      } catch (err) {
        console.error("Error fetching revenue entries:", err);
        setError(err as Error);
      } finally {
        setEntriesLoading(false);
      }
    },
    []
  );

  return { breakdown, entries, loading, entriesLoading, error, fetchBreakdown, fetchEntries };
}
