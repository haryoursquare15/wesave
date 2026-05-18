import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SandboxAuthProvider, useSandboxAuth } from "@/contexts/SandboxAuthContext";
import { SandboxModeContext } from "@/hooks/useSandboxAwareAuth";
import { useVfdBanking } from "@/hooks/useVfdBanking";
import { useVestaraLedger, VestaraLockedFund } from "@/hooks/useVestaraLedger";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, LogOut } from "lucide-react";
import { SandboxHeader } from "@/components/vfd-sandbox/SandboxHeader";
import { SandboxDashboard } from "@/components/vfd-sandbox/SandboxDashboard";
import { SandboxKYC } from "@/components/vfd-sandbox/SandboxKYC";
import { SandboxSavings } from "@/components/vfd-sandbox/SandboxSavings";
import { SandboxFund } from "@/components/vfd-sandbox/SandboxFund";
import { SandboxTransfer } from "@/components/vfd-sandbox/SandboxTransfer";
import { SandboxTransactions } from "@/components/vfd-sandbox/SandboxTransactions";
import { SandboxAjoTab } from "@/components/vfd-sandbox/SandboxAjoTab";
import { SandboxTargetTab } from "@/components/vfd-sandbox/SandboxTargetTab";
import { SandboxGoalTab } from "@/components/vfd-sandbox/SandboxGoalTab";
import { SandboxSplitTab } from "@/components/vfd-sandbox/SandboxSplitTab";
import { SandboxAssociationTab } from "@/components/vfd-sandbox/SandboxAssociationTab";
import { SandboxBillsTab } from "@/components/vfd-sandbox/SandboxBillsTab";
import { SandboxCardTab } from "@/components/vfd-sandbox/SandboxCardTab";
import { SandboxGroupInviteModal } from "@/components/vfd-sandbox/SandboxGroupInviteModal";
import { SandboxSplash } from "@/components/vfd-sandbox/SandboxSplash";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence } from "framer-motion";

interface LockConfig { id: string; duration_months: number; interest_rate: number; early_withdrawal_penalty: number; }
interface UserBalance {
  total_balance: number; locked_balance: number; savings_balance: number; available_balance: number;
}

type View = "dashboard" | "fund" | "transfer" | "lock" | "history" | "ajo" | "target" | "goal" | "split" | "association" | "bills" | "card";

function VfdSandboxInner() {
  const navigate = useNavigate();
  const { user, session, loading: authLoading, signOut } = useSandboxAuth();
  const { toast } = useToast();
  const vfd = useVfdBanking();
  const vestara = useVestaraLedger();

  const [kycDone, setKycDone] = useState(false);
  const [clientChecked, setClientChecked] = useState(false);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [banks, setBanks] = useState<Array<{ code: string; name: string }>>([]);

  // Vestara-driven balance (single source of truth)
  const [vestaraBalance, setVestaraBalance] = useState<UserBalance | null>(null);

  // Vestara-driven locked funds
  const [vestaraLockedFunds, setVestaraLockedFunds] = useState<VestaraLockedFund[]>([]);

  // Lock configs from vfd-banking (read-only config data)
  const [lockConfigs, setLockConfigs] = useState<LockConfig[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/vfd-sandbox/auth");
  }, [user, authLoading, navigate]);

  const initRef = useRef(false);
  useEffect(() => {
    if (authLoading || !user || !session?.access_token || initRef.current) return;
    initRef.current = true;

    void vfd.fetchClient().then(async (result) => {
      if (result?.data?.account_status === "active") {
        setKycDone(true);
        // Load bank list
        void vfd.getBankList().then((bankResult) => {
          if (bankResult) {
            const bankList = Array.isArray(bankResult.banks) ? bankResult.banks : [];
            if (bankList.length > 0) setBanks(bankList);
          }
        });
        // Load lock configs (read-only)
        void vfd.getLockConfigs().then((configRes) => {
          if (configRes?.data) setLockConfigs(configRes.data as LockConfig[]);
        });
      }
      setClientChecked(true);
    });

    // Initialize Vestara accounts & load balance
    refreshVestaraBalance();
    refreshVestaraTransactions();
    refreshVestaraLockedFunds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, session?.access_token]);

  /* ─── Vestara Balance (SINGLE SOURCE OF TRUTH) ─── */
  const refreshVestaraBalance = useCallback(async () => {
    const summary = await vestara.getBalanceSummary();
    if (summary) {
      setVestaraBalance({
        total_balance: summary.total,
        available_balance: summary.wallet,
        locked_balance: summary.locked_savings,
        savings_balance: summary.accrued_interest,
      });
    }
  }, [vestara]);

  /* ─── Vestara Locked Funds ─── */
  const refreshVestaraLockedFunds = useCallback(async () => {
    const funds = await vestara.getLockedFunds();
    setVestaraLockedFunds(funds);
  }, [vestara]);

  /* ─── Vestara Transactions ─── */
  const refreshVestaraTransactions = useCallback(async () => {
    await vestara.fetchTransactions();
  }, [vestara]);

  // Map vestara transactions — show net amount and platform fee for payouts
  const mappedTransactions = vestara.transactions.flatMap((tx) => {
    const fee = Number((tx.metadata as Record<string, unknown>)?.fee || 0);
    const gross = Number(tx.amount);
    const isPayout = tx.type === "thrift_payout";
    const net = isPayout && fee > 0 ? gross - fee : gross;

    const base = {
      id: tx.id,
      transaction_type: tx.type.includes("deposit") ? "credit"
        : tx.type.includes("withdraw") ? "debit"
        : tx.type === "thrift_payout" ? "credit"
        : tx.type === "thrift_contribution" ? "debit"
        : tx.type.includes("lock") ? "lock"
        : tx.type.includes("unlock") ? "credit"
        : tx.type.includes("interest") ? "credit"
        : tx.type.includes("reversal") ? "credit"
        : "debit",
      amount: net,
      description: isPayout && fee > 0
        ? `thrift payout (₦${gross.toLocaleString()} − ₦${fee.toLocaleString()} fee)`
        : tx.type.replace(/_/g, " "),
      reference: tx.reference,
      status: tx.status,
      created_at: tx.created_at,
    };

    // Surface the platform fee as its own debit row in history
    if (isPayout && fee > 0) {
      return [
        base,
        {
          id: `${tx.id}-fee`,
          transaction_type: "debit",
          amount: fee,
          description: "Platform fee (thrift payout)",
          reference: `${tx.reference}-fee`,
          status: tx.status,
          created_at: tx.created_at,
        },
      ];
    }
    return [base];
  });

  /* ─── Fund via Vestara Deposit ONLY (no dual-write) ─── */
  const handleFund = async (amount: number) => {
    const result = await vestara.deposit(amount);
    if (result) {
      toast({ title: "Account funded!", description: `₦${amount.toLocaleString()} credited via ledger` });
      // Also credit VFD sandbox for external parity (async, non-blocking)
      if (vfd.client?.vfd_account_number) {
        vfd.sandboxCredit(vfd.client.vfd_account_number, amount).catch(() => {
          console.warn("VFD sandbox credit failed (non-critical)");
        });
      }
      setTimeout(async () => {
        await refreshVestaraBalance();
        await refreshVestaraTransactions();
      }, 500);
    }
  };

  /* ─── Transfer via pending pattern (FIX: atomicity gap) ─── */
  const handleTransfer = async (params: {
    fromAccount: string; toAccount: string; bankCode: string;
    amount: number; narration: string; beneficiaryName: string;
  }) => {
    const reference = `transfer-${crypto.randomUUID().slice(0, 8)}`;

    // Step 1: Initiate transfer (moves funds to pending_transfer holding)
    const initiateResult = await vestara.transferInitiate(params.amount, reference, {
      to_account: params.toAccount,
      bank_code: params.bankCode,
      narration: params.narration,
      beneficiary_name: params.beneficiaryName,
    });

    if (!initiateResult?.success) return null;

    // Step 2: Execute VFD transfer
    try {
      const vfdResult = await vfd.transfer(params) as { data?: { status?: string; message?: string } } | null;

      // VFD returns status "00" on success; anything else (e.g. "99") is a failure
      const vfdStatus = vfdResult?.data?.status;
      const vfdSucceeded = vfdStatus === "00";

      // Step 3: Complete or fail based on VFD result
      if (vfdSucceeded) {
        await vestara.transferComplete(reference, true, {
          vfd_result: vfdResult,
        });
        toast({ title: "Transfer successful!" });
      } else {
        // VFD failed — refund from holding back to wallet
        const reason = vfdResult?.data?.message || "VFD transfer failed";
        await vestara.transferComplete(reference, false, {
          failure_reason: reason,
          vfd_result: vfdResult,
        });
        toast({ title: "Transfer failed", description: `${reason}. Funds returned to your wallet.`, variant: "destructive" });
      }
    } catch (err) {
      // Network error — refund
      await vestara.transferComplete(reference, false, {
        failure_reason: err instanceof Error ? err.message : "Unknown error",
      });
      toast({ title: "Transfer failed", description: "Funds have been returned to your wallet", variant: "destructive" });
    }

    await refreshVestaraBalance();
    await refreshVestaraTransactions();
    return initiateResult;
  };

  /* ─── Lock via Vestara Ledger ONLY (no dual-write) ─── */
  const handleCreateLock = async (amount: number, duration: number) => {
    // Find matching config for interest/penalty rates
    const config = lockConfigs.find(c => c.duration_months === duration);
    const metadata = config ? {
      interest_rate: config.interest_rate,
      penalty_rate: config.early_withdrawal_penalty,
    } : {};

    const result = await vestara.lockFunds(amount, duration, undefined, metadata);
    if (result?.success) {
      toast({ title: "Funds Locked!", description: `₦${amount.toLocaleString()} locked for ${duration} months` });
      await Promise.all([refreshVestaraBalance(), refreshVestaraLockedFunds()]);
    }
  };

  /* ─── Unlock: uses specific vestara lock_account_id (FIX: was picking [0]) ─── */
  const handleUnlock = async (lockId: string) => {
    // lockId here is now the vestara_accounts.id directly
    const result = await vestara.unlockFunds(lockId);
    if (result?.success) {
      toast({ title: "Funds Unlocked!" });
      await Promise.all([refreshVestaraBalance(), refreshVestaraLockedFunds()]);
    }
  };

  const handleBreakLock = async (lockId: string) => {
    // Breaking lock = early unlock, penalty auto-calculated by RPC
    const result = await vestara.unlockFunds(lockId);
    if (result?.success) {
      const penalty = result.penalty || 0;
      toast({ title: "Lock Broken", description: penalty > 0 ? `Penalty: ₦${Number(penalty).toLocaleString()}` : "No penalty applied" });
      await Promise.all([refreshVestaraBalance(), refreshVestaraLockedFunds()]);
    }
  };

  const handleLoadBanks = async () => {
    const result = await vfd.getBankList();
    if (result) {
      const bankList = Array.isArray(result.banks) ? result.banks : [];
      if (bankList.length === 0) {
        const bankData = result.data as Record<string, unknown>;
        const raw = bankData?.data;
        if (Array.isArray(raw)) {
          setBanks(raw.map((b: Record<string, unknown>) => ({
            code: (b.bankCode || b.code || b.bank_code || "").toString(),
            name: (b.bankName || b.name || b.bank_name || "").toString(),
          })));
        }
      } else {
        setBanks(bankList);
      }
    }
  };

  const handleValidateBeneficiary = async (account: string, bankCode: string): Promise<string | null> => {
    const result = await vfd.validateBeneficiary(account, bankCode);
    if (!result) return null;
    if (result.error) {
      toast({ title: "Verification failed", description: String(result.error), variant: "destructive" });
      return null;
    }
    const name = result.accountName ||
      ((result.data as Record<string, unknown>)?.data as Record<string, unknown>)?.accountName ||
      ((result.data as Record<string, unknown>)?.data as Record<string, unknown>)?.account_name;
    if (!name) {
      toast({ title: "Verification failed", description: "VFD could not return an account name. Check the bank/account number.", variant: "destructive" });
      return null;
    }
    return name?.toString() || null;
  };

  const goBack = () => setCurrentView("dashboard");

  if (authLoading || (user && !clientChecked)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Use Vestara ledger balance as sole source of truth
  const balanceData = {
    totalBalance: vestaraBalance ? vestaraBalance.total_balance : 0,
    availableBalance: vestaraBalance ? vestaraBalance.available_balance : 0,
    lockedBalance: vestaraBalance ? vestaraBalance.locked_balance : 0,
    savingsBalance: vestaraBalance ? vestaraBalance.savings_balance : 0,
    accountNumber: vfd.client?.vfd_account_number || "—",
    fullName: vfd.client?.full_name || "—",
  };

  // Compute accrued interest per lock from accrued_interest accounts
  // (each accrued_interest account stores metadata.lock_account_id pointing
  // back to its parent locked_savings account).
  const interestByLock = vestara.accounts
    .filter((a) => a.account_type === "accrued_interest")
    .reduce<Record<string, number>>((acc, a) => {
      const lockId = (a.metadata as Record<string, unknown> | null)?.lock_account_id as string | undefined;
      if (lockId) acc[lockId] = (acc[lockId] || 0) + Number(a.balance);
      return acc;
    }, {});

  // Map vestara locked funds to the format SandboxLockFunds expects
  const mappedLockedFunds = vestaraLockedFunds.map(lf => {
    const accrued = interestByLock[lf.id] || 0;
    return {
      id: lf.id, // This IS the vestara_accounts.id — used for unlock
      principal_amount: lf.balance,
      interest_rate: lf.metadata?.interest_rate || 10,
      duration_months: lf.metadata?.duration_months || 0,
      expected_interest: accrued,
      total_payout: lf.balance + accrued,
      start_date: lf.metadata?.locked_at || lf.created_at,
      maturity_date: lf.metadata?.maturity_date || "",
      actual_unlock_date: null,
      penalty_amount: 0,
      status: lf.balance > 0 ? "active" : "unlocked",
    };
  });

  // Product tabs render their own internal back navigation (e.g. "Back to Targets"
  // when in detail view). We only need a single, top-level back button that
  // returns to the dashboard. To avoid the glitch where two stacked back
  // buttons confuse users, the wrapper exposes a small "Dashboard" link
  // instead of a duplicate ArrowLeft.
  const ProductWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="space-y-4">
      <button
        onClick={goBack}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> Dashboard
      </button>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <SandboxHeader />
      {kycDone && <SandboxGroupInviteModal onAccepted={() => { /* downstream UIs poll on their own */ }} />}
      <div className="max-w-lg mx-auto px-4 pt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground truncate">
          Sandbox: <span className="font-medium text-foreground">{user?.email}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await signOut();
            navigate("/vfd-sandbox/auth");
          }}
          className="h-7 text-xs"
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />
          Sign out
        </Button>
      </div>
      <div className="max-w-lg mx-auto px-4 py-5 pb-32 space-y-5">
        {!kycDone ? (
          <SandboxKYC
            vfd={vfd}
            onComplete={() => {
              setKycDone(true);
              refreshVestaraBalance();
              refreshVestaraLockedFunds();
            }}
          />
        ) : (
          <>
            {currentView === "dashboard" && (
              <SandboxDashboard
                balance={balanceData}
                onNavigate={(v) => setCurrentView(v as View)}
                recentTransactions={mappedTransactions}
              />
            )}
            {currentView === "fund" && (
              <SandboxFund
                loading={vfd.loading || vestara.loading}
                accountNumber={balanceData.accountNumber}
                bankName="VFD Microfinance Bank"
                fullName={balanceData.fullName}
                onFund={handleFund}
                onBack={goBack}
              />
            )}
            {currentView === "transfer" && (
              <SandboxTransfer
                loading={vfd.loading || vestara.loading}
                accountNumber={balanceData.accountNumber}
                banks={banks}
                onLoadBanks={handleLoadBanks}
                onValidate={handleValidateBeneficiary}
                onTransfer={handleTransfer}
                onBack={goBack}
              />
            )}
            {currentView === "lock" && (
              <SandboxSavings
                userBalance={vestaraBalance}
                onRefresh={() => { refreshVestaraBalance(); refreshVestaraTransactions(); }}
                onBack={goBack}
              />
            )}
            {currentView === "history" && (
              <SandboxTransactions
                transactions={mappedTransactions}
                loading={vestara.loading}
                onRefresh={refreshVestaraTransactions}
                onBack={goBack}
              />
            )}
            {currentView === "ajo" && <ProductWrapper><SandboxAjoTab /></ProductWrapper>}
            {currentView === "target" && <ProductWrapper><SandboxTargetTab /></ProductWrapper>}
            {currentView === "goal" && <ProductWrapper><SandboxGoalTab /></ProductWrapper>}
            {currentView === "split" && <ProductWrapper><SandboxSplitTab /></ProductWrapper>}
            {currentView === "association" && <ProductWrapper><SandboxAssociationTab /></ProductWrapper>}
            {currentView === "bills" && <ProductWrapper><SandboxBillsTab /></ProductWrapper>}
            {currentView === "card" && <ProductWrapper><SandboxCardTab /></ProductWrapper>}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Provides the sandbox session to all hooks via SandboxModeContext, so that
 * useVfdBanking / useVestaraLedger talk to the sandbox Supabase client (and
 * the sandbox-authenticated user) instead of the main WeSave session.
 */
function SandboxSessionBridge({ children }: { children: React.ReactNode }) {
  const { session } = useSandboxAuth();
  const value = useMemo(() => ({ session }), [session]);
  return (
    <SandboxModeContext.Provider value={value}>
      {children}
    </SandboxModeContext.Provider>
  );
}

export default function VfdSandbox() {
  return (
    <SandboxAuthProvider>
      <SandboxSessionBridge>
        <VfdSandboxInner />
      </SandboxSessionBridge>
    </SandboxAuthProvider>
  );
}
