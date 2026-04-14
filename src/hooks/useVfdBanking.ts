import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface VfdClient {
  id: string;
  user_id: string;
  vfd_client_id: string | null;
  vfd_account_number: string | null;
  bvn: string | null;
  nin: string | null;
  address: string | null;
  full_name: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  tier: string;
  kyc_method: string | null;
  consent_status: string;
  account_status: string;
  balance: number;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface VfdTransaction {
  id: string;
  user_id: string;
  vfd_account_number: string | null;
  amount: number;
  transaction_type: string;
  status: string;
  reference: string | null;
  vfd_reference: string | null;
  beneficiary_account: string | null;
  beneficiary_bank: string | null;
  beneficiary_name: string | null;
  description: string | null;
  created_at: string;
}

export function useVfdBanking() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<VfdClient | null>(null);
  const [transactions, setTransactions] = useState<VfdTransaction[]>([]);

  const invokeVfd = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      const accessToken = session?.access_token;
      if (!accessToken) {
        toast({ title: "Not authenticated", variant: "destructive" });
        return null;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("vfd-banking", {
          body: { action, ...body },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (error) {
          toast({ title: "VFD API Error", description: error.message, variant: "destructive" });
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

  const fetchClient = useCallback(async () => {
    const result = await invokeVfd("get_client");
    if (result?.data) setClient(result.data);
    return result;
  }, [invokeVfd]);

  const fetchTransactions = useCallback(async () => {
    const result = await invokeVfd("get_transactions");
    if (result?.data) setTransactions(result.data);
    return result;
  }, [invokeVfd]);

  const lookupBvn = useCallback(
    (bvn: string) => invokeVfd("bvn_lookup", { bvn }),
    [invokeVfd]
  );

  const createNoConsent = useCallback(
    (bvn: string, dateOfBirth: string) =>
      invokeVfd("create_no_consent", { bvn, dateOfBirth }),
    [invokeVfd]
  );

  const createTiered = useCallback(
    (body: { bvn?: string; nin?: string; dateOfBirth: string; address?: string }) =>
      invokeVfd("create_tiered", body),
    [invokeVfd]
  );

  const createConsent = useCallback(
    (body: Record<string, unknown>) => invokeVfd("create_consent", body),
    [invokeVfd]
  );

  const triggerBvnConsent = useCallback(
    (clientId: string) => invokeVfd("bvn_consent", { clientId }),
    [invokeVfd]
  );

  const releaseClient = useCallback(
    (clientId: string) => invokeVfd("client_release", { clientId }),
    [invokeVfd]
  );

  const upgradeTier = useCallback(
    (body: { bvn?: string; nin?: string; address?: string }) =>
      invokeVfd("tier_upgrade", body),
    [invokeVfd]
  );

  const checkBalance = useCallback(
    (accountNo: string) => invokeVfd("balance_enquiry", { accountNo }),
    [invokeVfd]
  );

  const getBankList = useCallback(() => invokeVfd("bank_list"), [invokeVfd]);

  const validateBeneficiary = useCallback(
    (accountNo: string, bankCode: string) =>
      invokeVfd("validate_beneficiary", { accountNo, bankCode }),
    [invokeVfd]
  );

  const transfer = useCallback(
    (params: {
      fromAccount: string;
      toAccount: string;
      bankCode: string;
      amount: number;
      narration: string;
      beneficiaryName: string;
    }) => invokeVfd("transfer", params),
    [invokeVfd]
  );

  const sandboxCredit = useCallback(
    (accountNo: string, amount: number) =>
      invokeVfd("sandbox_credit", { accountNo, amount }),
    [invokeVfd]
  );

  // Lock Funds methods
  const getLockConfigs = useCallback(() => invokeVfd("get_lock_configs"), [invokeVfd]);
  const getUserBalance = useCallback(() => invokeVfd("get_user_balance"), [invokeVfd]);
  const syncBalance = useCallback(() => invokeVfd("sync_balance"), [invokeVfd]);
  const createLock = useCallback(
    (amount: number, duration_months: number) =>
      invokeVfd("create_lock", { amount, duration_months }),
    [invokeVfd]
  );
  const getLockedFunds = useCallback(() => invokeVfd("get_locked_funds"), [invokeVfd]);
  const unlockFunds = useCallback(
    (lock_id: string) => invokeVfd("unlock_funds", { lock_id }),
    [invokeVfd]
  );
  const breakLock = useCallback(
    (lock_id: string) => invokeVfd("break_lock", { lock_id }),
    [invokeVfd]
  );
  const getLockLedger = useCallback(() => invokeVfd("get_lock_ledger"), [invokeVfd]);

  return {
    loading,
    client,
    transactions,
    fetchClient,
    fetchTransactions,
    lookupBvn,
    createNoConsent,
    createTiered,
    createConsent,
    triggerBvnConsent,
    releaseClient,
    upgradeTier,
    checkBalance,
    getBankList,
    validateBeneficiary,
    transfer,
    sandboxCredit,
    getLockConfigs,
    getUserBalance,
    syncBalance,
    createLock,
    getLockedFunds,
    unlockFunds,
    breakLock,
    getLockLedger,
  };
}
