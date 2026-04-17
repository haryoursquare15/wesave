import { useState, useCallback } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─── */
export interface VestaraAccount {
  id: string;
  user_id: string | null;
  account_type: string;
  balance: number;
  currency: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface VestaraTransaction {
  id: string;
  type: string;
  status: string;
  reference: string;
  amount: number;
  initiated_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
  vestara_ledger_entries?: VestaraLedgerEntry[];
}

export interface VestaraLedgerEntry {
  id: string;
  transaction_id: string;
  account_id: string;
  debit: number;
  credit: number;
  created_at: string;
}

export interface VestaraBalanceSummary {
  wallet: number;
  locked_savings: number;
  accrued_interest: number;
  total: number;
  accounts: VestaraAccount[];
}

export interface VestaraLockedFund {
  id: string;
  balance: number;
  metadata: {
    interest_rate?: number;
    penalty_rate?: number;
    duration_months?: number;
    maturity_date?: string;
    locked_at?: string;
  };
  created_at: string;
}

/* ─── Hook ─── */
export function useVestaraLedger() {
  const { session, client: supabase } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<VestaraAccount[]>([]);
  const [transactions, setTransactions] = useState<VestaraTransaction[]>([]);

  const invoke = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      const accessToken = session?.access_token;
      if (!accessToken) {
        toast({ title: "Not authenticated", variant: "destructive" });
        return null;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("vestara-ledger", {
          body: { action, ...body },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (error) {
          toast({ title: "Ledger Error", description: error.message, variant: "destructive" });
          return null;
        }

        if (data?.error) {
          toast({ title: "Ledger Error", description: data.error, variant: "destructive" });
          return null;
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({ title: "Request failed", description: message, variant: "destructive" });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token, toast]
  );

  /* ─── Account & Balance ─── */
  const fetchAccounts = useCallback(async () => {
    const result = await invoke("get_accounts");
    if (result?.accounts) setAccounts(result.accounts);
    return result;
  }, [invoke]);

  const getBalance = useCallback(async () => {
    const result = await invoke("get_balance");
    return result;
  }, [invoke]);

  const getBalanceSummary = useCallback(async (): Promise<VestaraBalanceSummary | null> => {
    const result = await invoke("get_accounts");
    if (!result?.accounts) return null;
    const accts = result.accounts as VestaraAccount[];
    setAccounts(accts);

    const wallet = accts.find(a => a.account_type === "wallet")?.balance || 0;
    const locked = accts
      .filter(a => a.account_type === "locked_savings")
      .reduce((sum, a) => sum + Number(a.balance), 0);
    const interest = accts
      .filter(a => a.account_type === "accrued_interest")
      .reduce((sum, a) => sum + Number(a.balance), 0);

    return {
      wallet: Number(wallet),
      locked_savings: locked,
      accrued_interest: interest,
      total: Number(wallet) + locked + interest,
      accounts: accts,
    };
  }, [invoke]);

  /* ─── Locked Funds (from Vestara accounts with metadata) ─── */
  const getLockedFunds = useCallback(async (): Promise<VestaraLockedFund[]> => {
    const result = await invoke("get_locked_funds");
    if (!result?.locked_funds) return [];
    return (result.locked_funds as VestaraAccount[]).map(a => ({
      id: a.id,
      balance: Number(a.balance),
      metadata: (a.metadata || {}) as VestaraLockedFund["metadata"],
      created_at: a.created_at,
    }));
  }, [invoke]);

  /* ─── Transactions ─── */
  const fetchTransactions = useCallback(async (limit = 50, offset = 0) => {
    const result = await invoke("get_transactions", { limit, offset });
    if (result?.transactions) setTransactions(result.transactions);
    return result;
  }, [invoke]);

  /* ─── Deposit (sandbox credit → vestara deposit) ─── */
  const deposit = useCallback(
    (amount: number, reference?: string, metadata?: Record<string, unknown>) =>
      invoke("deposit_webhook", {
        account_number: "__self__",
        amount,
        reference: reference || `sandbox-${crypto.randomUUID().slice(0, 8)}`,
        metadata: metadata || {},
      }),
    [invoke]
  );

  /* ─── Withdraw (direct, non-external) ─── */
  const withdraw = useCallback(
    (amount: number, reference?: string, metadata?: Record<string, unknown>) =>
      invoke("withdraw", {
        amount,
        reference: reference || `wd-${crypto.randomUUID().slice(0, 8)}`,
        metadata: metadata || {},
      }),
    [invoke]
  );

  /* ─── Transfer (pending pattern for external transfers) ─── */
  const transferInitiate = useCallback(
    (amount: number, reference?: string, metadata?: Record<string, unknown>) =>
      invoke("transfer_initiate", {
        amount,
        reference: reference || `txfr-${crypto.randomUUID().slice(0, 8)}`,
        metadata: metadata || {},
      }),
    [invoke]
  );

  const transferComplete = useCallback(
    (originalReference: string, success: boolean, metadata?: Record<string, unknown>) =>
      invoke("transfer_complete", {
        original_reference: originalReference,
        success,
        metadata: metadata || {},
      }),
    [invoke]
  );

  /* ─── Lock Funds ─── */
  const lockFunds = useCallback(
    (amount: number, durationMonths: number, reference?: string, metadata?: Record<string, unknown>) =>
      invoke("lock_funds", {
        amount,
        duration_months: durationMonths,
        reference: reference || `lock-${crypto.randomUUID().slice(0, 8)}`,
        metadata: metadata || {},
      }),
    [invoke]
  );

  /* ─── Unlock Funds (auto-calculates penalty from metadata) ─── */
  const unlockFunds = useCallback(
    (lockAccountId: string, penalty?: number, reference?: string) =>
      invoke("unlock_funds", {
        lock_account_id: lockAccountId,
        penalty: penalty ?? null,
        reference: reference || `unlock-${crypto.randomUUID().slice(0, 8)}`,
      }),
    [invoke]
  );

  /* ─── Thrift ─── */
  const thriftContribute = useCallback(
    (groupId: string, amount: number, reference?: string) =>
      invoke("thrift_contribute", {
        group_id: groupId,
        amount,
        reference: reference || `thrift-${crypto.randomUUID().slice(0, 8)}`,
      }),
    [invoke]
  );

  const thriftPayout = useCallback(
    (beneficiaryId: string, groupId: string, grossAmount: number, fee = 0, reference?: string) =>
      invoke("thrift_payout", {
        beneficiary_id: beneficiaryId,
        group_id: groupId,
        gross_amount: grossAmount,
        fee,
        reference: reference || `payout-${crypto.randomUUID().slice(0, 8)}`,
      }),
    [invoke]
  );

  /* ─── Split Pay ─── */
  const splitPay = useCallback(
    (splitId: string, amount: number, reference?: string) =>
      invoke("split_pay", {
        split_id: splitId,
        amount,
        reference: reference || `split-${crypto.randomUUID().slice(0, 8)}`,
      }),
    [invoke]
  );

  const splitDistribute = useCallback(
    (splitId: string, recipients: Array<{ user_id: string; amount: number }>, reference?: string) =>
      invoke("split_distribute", {
        split_id: splitId,
        recipients,
        reference: reference || `split-dist-${crypto.randomUUID().slice(0, 8)}`,
      }),
    [invoke]
  );

  /* ─── Crowdfund ─── */
  const crowdfundContribute = useCallback(
    (campaignId: string, amount: number, reference?: string) =>
      invoke("crowdfund_contribute", {
        campaign_id: campaignId,
        amount,
        reference: reference || `cf-${crypto.randomUUID().slice(0, 8)}`,
      }),
    [invoke]
  );

  const crowdfundDisburse = useCallback(
    (beneficiaryId: string, campaignId: string, amount: number, reference?: string) =>
      invoke("crowdfund_disburse", {
        beneficiary_id: beneficiaryId,
        campaign_id: campaignId,
        amount,
        reference: reference || `cf-disburse-${crypto.randomUUID().slice(0, 8)}`,
      }),
    [invoke]
  );

  /* ─── Interest ─── */
  const payoutInterest = useCallback(
    (amount: number, reference?: string) =>
      invoke("payout_interest", {
        amount,
        reference: reference || `int-payout-${crypto.randomUUID().slice(0, 8)}`,
      }),
    [invoke]
  );

  /* ─── Reversal ─── */
  const reverseTransaction = useCallback(
    (originalReference: string, reason: string, metadata?: Record<string, unknown>) =>
      invoke("reverse_transaction", {
        original_reference: originalReference,
        reason,
        metadata: metadata || {},
      }),
    [invoke]
  );

  return {
    loading,
    accounts,
    transactions,
    // Balance
    fetchAccounts,
    getBalance,
    getBalanceSummary,
    getLockedFunds,
    // Transactions
    fetchTransactions,
    // Core operations
    deposit,
    withdraw,
    transferInitiate,
    transferComplete,
    lockFunds,
    unlockFunds,
    // Thrift
    thriftContribute,
    thriftPayout,
    // Split
    splitPay,
    splitDistribute,
    // Crowdfund
    crowdfundContribute,
    crowdfundDisburse,
    // Interest
    payoutInterest,
    // Admin
    reverseTransaction,
    // Raw invoke for custom actions
    invoke,
  };
}
