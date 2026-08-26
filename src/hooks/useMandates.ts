import { useCallback, useEffect, useMemo, useState } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";

/**
 * Customer-facing view of VFD direct-debit (e-mandate) authorizations.
 *
 * Reads the central `mandates` table directly — RLS restricts rows to
 * `auth.uid() = user_id`, so every product (Thrift, Target Ajo, Goal Savings)
 * shares one source of truth for setup fee, amount, dates and bank status.
 */
export type MandateProductType = "thrift" | "target_ajo" | "fd_investment" | string;

export interface MandateRow {
  id: string;
  product_type: MandateProductType;
  product_reference: string | null;
  mandate_reference: string | null;
  mandate_code: string | null;
  status: string;
  amount: number | null;
  frequency: string | null;
  start_date: string | null;
  end_date: string | null;
  payer_bank_code: string | null;
  payer_account_number: string | null;
  setup_fee: number | null;
  setup_fee_internal_share: number | null;
  setup_fee_nibss_share: number | null;
  bank_approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  expires_at: string | null;
}

export const PRODUCT_LABEL: Record<string, string> = {
  thrift: "Ajo Thrift Group",
  target_ajo: "Target Ajo",
  fd_investment: "Goal Savings",
};

export const MANDATE_STATUS_META: Record<
  string,
  { label: string; tone: "success" | "warning" | "muted" | "destructive"; hint: string }
> = {
  bank_approved: {
    label: "Active",
    tone: "success",
    hint: "Your bank has approved this mandate. Contributions debit automatically.",
  },
  authorized: {
    label: "Active",
    tone: "success",
    hint: "Your bank has approved this mandate. Contributions debit automatically.",
  },
  pending: {
    label: "Awaiting bank approval",
    tone: "warning",
    hint: "Send the ₦50 NIBSS authorization from your payer account to activate.",
  },
  awaiting_approval: {
    label: "Awaiting bank approval",
    tone: "warning",
    hint: "We're checking with your bank — this usually completes within minutes.",
  },
  expired: { label: "Expired", tone: "destructive", hint: "Set up a new mandate to resume auto-debits." },
  failed: { label: "Failed", tone: "destructive", hint: "Your bank declined this mandate. Please re-authorize." },
  cancelled: { label: "Cancelled", tone: "muted", hint: "This mandate is no longer active." },
};

export function mandateStatusMeta(status: string) {
  return (
    MANDATE_STATUS_META[status] || {
      label: status.replace(/_/g, " "),
      tone: "muted" as const,
      hint: "Mandate status reported by your bank.",
    }
  );
}

export function useMandates() {
  const { client, session } = useSandboxAwareAuth();
  const [mandates, setMandates] = useState<MandateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user?.id) {
      setMandates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await client
      .from("mandates")
      .select(
        "id, product_type, product_reference, mandate_reference, mandate_code, status, amount, frequency, start_date, end_date, payer_bank_code, payer_account_number, setup_fee, setup_fee_internal_share, setup_fee_nibss_share, bank_approved_at, rejection_reason, created_at, expires_at",
      )
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    setMandates((data as unknown as MandateRow[]) || []);
    setLoading(false);
  }, [client, session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byProduct = useMemo(() => {
    const map = new Map<string, MandateRow>();
    for (const m of mandates) {
      const key = `${m.product_type}:${m.product_reference}`;
      // list is newest-first, so keep the first occurrence
      if (!map.has(key)) map.set(key, m);
    }
    return map;
  }, [mandates]);

  const findFor = useCallback(
    (productType: MandateProductType, productReference: string | null | undefined) =>
      productReference ? byProduct.get(`${productType}:${productReference}`) || null : null,
    [byProduct],
  );

  return { mandates, loading, refresh, findFor };
}
