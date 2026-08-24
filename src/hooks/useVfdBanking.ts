import { useState, useCallback } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";

import { getUserFriendlyError } from "@/lib/errorMessages";
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
  kyc_review_status?: string | null;
  kyc_review_reason?: string | null;
  kyc_requested_tier?: number | null;
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
  session_id: string | null;
  beneficiary_account: string | null;
  beneficiary_bank: string | null;
  beneficiary_name: string | null;
  description: string | null;
  created_at: string;
}

export function useVfdBanking() {
  const { session, client: supabase } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<VfdClient | null>(null);
  const [transactions, setTransactions] = useState<VfdTransaction[]>([]);

  const invokeVfd = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || session?.access_token;
      if (!accessToken) {
        toast({ title: "Not authenticated", variant: "destructive" });
        return null;
      }

      setLoading(true);
      try {
        let data: any = null;
        let error: any = null;
        const isSendError = (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err || "");
          return /failed to send|unable to send|networkerror|temporarily unavailable|service_degraded/i.test(msg);
        };

        for (let attempt = 0; attempt < 2; attempt += 1) {
          const result = await supabase.functions.invoke("vfd-banking", {
            body: { action, ...body },
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          data = result.data;
          error = result.error;
          if (!error || !isSendError(error) || attempt === 1) break;
          await new Promise((resolve) => setTimeout(resolve, 350));
        }

        if (error) {
          // Pull the real backend error body (FunctionsHttpError hides it
          // behind a generic "non-2xx" message). This surfaces tier-limit,
          // KYC, and validation messages verbatim.
          let backendMsg = "";
          let backendCode = "";
          try {
            const ctx = (error as { context?: Response }).context;
            if (ctx && typeof ctx.clone === "function") {
              const body = await ctx.clone().json();
              backendMsg = body?.error || body?.message || "";
              backendCode = body?.code || "";
            }
          } catch { /* fall back */ }
          toast({
            title: backendCode === "TIER_LIMIT_EXCEEDED" || backendCode === "TIER_DAILY_LIMIT_EXCEEDED"
              ? "Transaction limit reached"
              : "Transaction failed",
            description: backendMsg || (isSendError(error)
              ? "We couldn't reach the banking service. Please try again in a moment."
              : getUserFriendlyError(error instanceof Error ? error.message : String(error))),
            variant: "destructive",
          });
          return null;
        }

        // Defensive: money-moving paths must not treat any truthy payload as
        // success. Some backend/VFD failures can arrive as HTTP 200 with either
        // top-level errors or nested { data: { status: "99" } } sentinels.
        const response = data as {
          error?: string;
          message?: string;
          code?: string;
          status?: string;
          data?: { error?: string; message?: string; code?: string; status?: string };
        } | null;
        const embeddedStatus = response?.data?.status ?? response?.status;
        const embeddedError = response?.error || response?.data?.error;
        if (embeddedError || (embeddedStatus && embeddedStatus !== "00")) {
          const embeddedCode = response?.code || response?.data?.code || "";
          const embeddedMsg = embeddedError || response?.data?.message || response?.message;
          // Name enquiry is a soft check; let the caller render an inline
          // message instead of a destructive global toast.
          if (action === "validate_beneficiary") {
            return { ...(response || {}), accountName: null, error: embeddedMsg };
          }
          toast({
            title: embeddedCode === "TIER_LIMIT_EXCEEDED" || embeddedCode === "TIER_DAILY_LIMIT_EXCEEDED"
              ? "Transaction limit reached"
              : "Transaction failed",
            description: getUserFriendlyError(embeddedMsg || "The transaction could not be completed."),
            variant: "destructive",
          });
          return null;
        }

        if (action === "transfer" && embeddedStatus !== "00") {
          toast({
            title: "Transaction failed",
            description: "The transfer was not confirmed. Please try again or contact support.",
            variant: "destructive",
          });
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
    [session?.access_token, supabase, toast]
  );

  const fetchClient = useCallback(async () => {
    const result = await invokeVfd("get_client");
    if (result?.data) setClient(result.data);
    return result;
  }, [invokeVfd]);

  const retryKyc = useCallback(async () => {
    const result = await invokeVfd("kyc_retry");
    if (result) await fetchClient();
    return result;
  }, [invokeVfd, fetchClient]);

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
      invokeVfd("validate_beneficiary", {
        accountNo,
        bankCode,
        // VFD: 999999 = intra-bank (within VFD); anything else = inter
        transferType: bankCode === "999999" ? "intra" : "inter",
      }),
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
    }) => invokeVfd("transfer", {
      ...params,
      // VFD: 999999 = intra-bank (within VFD); anything else = inter
      transferType: params.bankCode === "999999" ? "intra" : "inter",
    }),
    [invokeVfd]
  );

  // Get a fee quote (tier, transfer fee, stamp duty, total debit) without
  // committing — used by the transfer preview modal before PIN authorization.
  const quoteTransfer = useCallback(
    (params: { toAccount: string; bankCode: string; amount: number }) =>
      invokeVfd("quote_transfer", {
        ...params,
        transferType: params.bankCode === "999999" || params.toAccount.startsWith("9") ? "intra" : "inter",
      }),
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

  // Transfer beneficiaries
  const listTransferBeneficiaries = useCallback(
    () => invokeVfd("list_transfer_beneficiaries"),
    [invokeVfd]
  );
  const saveTransferBeneficiary = useCallback(
    (body: {
      alias?: string;
      account_number: string;
      bank_code: string;
      bank_name: string;
      beneficiary_name: string;
    }) => invokeVfd("save_transfer_beneficiary", body),
    [invokeVfd]
  );
  const deleteTransferBeneficiary = useCallback(
    (id: string) => invokeVfd("delete_transfer_beneficiary", { id }),
    [invokeVfd]
  );
  const pinTransferBeneficiary = useCallback(
    (id: string, pinned: boolean) => invokeVfd("pin_transfer_beneficiary", { id, pinned }),
    [invokeVfd]
  );

  return {
    loading,
    client,
    retryKyc,
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
    quoteTransfer,
    getLockConfigs,
    getUserBalance,
    syncBalance,
    createLock,
    getLockedFunds,
    unlockFunds,
    breakLock,
    getLockLedger,
    listTransferBeneficiaries,
    saveTransferBeneficiary,
    deleteTransferBeneficiary,
    pinTransferBeneficiary,
  };
}
