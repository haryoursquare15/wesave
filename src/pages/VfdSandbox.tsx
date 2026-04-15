import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVfdBanking } from "@/hooks/useVfdBanking";
import { useVestaraLedger } from "@/hooks/useVestaraLedger";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";
import { SandboxHeader } from "@/components/vfd-sandbox/SandboxHeader";
import { SandboxDashboard } from "@/components/vfd-sandbox/SandboxDashboard";
import { SandboxKYC } from "@/components/vfd-sandbox/SandboxKYC";
import { SandboxLockFunds } from "@/components/vfd-sandbox/SandboxLockFunds";
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
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface LockConfig { id: string; duration_months: number; interest_rate: number; early_withdrawal_penalty: number; }
interface LockedFund {
  id: string; principal_amount: number; interest_rate: number; duration_months: number;
  expected_interest: number; total_payout: number; start_date: string; maturity_date: string;
  actual_unlock_date: string | null; penalty_amount: number; status: string;
}
interface UserBalance {
  total_balance: number; locked_balance: number; savings_balance: number; available_balance: number;
}

type View = "dashboard" | "fund" | "transfer" | "lock" | "history" | "ajo" | "target" | "goal" | "split" | "association" | "bills" | "card";

export default function VfdSandbox() {
  const navigate = useNavigate();
  const { user, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const vfd = useVfdBanking();
  const vestara = useVestaraLedger();

  const [kycDone, setKycDone] = useState(false);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [banks, setBanks] = useState<Array<{ code: string; name: string }>>([]);

  // Vestara-driven balance
  const [vestaraBalance, setVestaraBalance] = useState<UserBalance | null>(null);

  // Legacy lock state (from vfd_sandbox_locked_funds)
  const [lockConfigs, setLockConfigs] = useState<LockConfig[]>([]);
  const [lockedFunds, setLockedFunds] = useState<LockedFund[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
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
        // Load legacy lock configs
        loadLockData();
      }
    });

    // Initialize Vestara accounts & load balance
    refreshVestaraBalance();
    refreshVestaraTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, session?.access_token]);

  /* ─── Vestara Balance ─── */
  const refreshVestaraBalance = useCallback(async () => {
    const summary = await vestara.getBalanceSummary();
    if (summary) {
      setVestaraBalance({
        total_balance: summary.total,
        available_balance: summary.wallet,
        locked_balance: summary.locked_savings,
        savings_balance: 0,
      });
    }
  }, [vestara]);

  /* ─── Vestara Transactions (mapped to legacy format) ─── */
  const refreshVestaraTransactions = useCallback(async () => {
    await vestara.fetchTransactions();
  }, [vestara]);

  // Map vestara transactions to the format SandboxTransactions/Dashboard expects
  const mappedTransactions = vestara.transactions.map((tx) => ({
    id: tx.id,
    transaction_type: tx.type.includes("deposit") ? "credit"
      : tx.type.includes("withdraw") ? "debit"
      : tx.type.includes("lock") ? "lock"
      : tx.type.includes("interest") ? "credit"
      : "debit",
    amount: tx.vestara_ledger_entries
      ? tx.vestara_ledger_entries.reduce((max, e) => Math.max(max, Number(e.debit) || Number(e.credit) || 0), 0)
      : 0,
    description: tx.type.replace(/_/g, " "),
    reference: tx.reference,
    status: tx.status,
    created_at: tx.created_at,
  }));

  /* ─── Legacy Lock Data (still from vfd-banking for configs/UI) ─── */
  const loadLockData = useCallback(async () => {
    const [configRes, fundsRes] = await Promise.all([
      vfd.getLockConfigs(),
      vfd.getLockedFunds(),
    ]);
    if (configRes?.data) setLockConfigs(configRes.data as LockConfig[]);
    if (fundsRes?.data) setLockedFunds(fundsRes.data as LockedFund[]);
  }, [vfd]);

  /* ─── Fund via Vestara Deposit ─── */
  const handleFund = async (amount: number) => {
    // Also credit VFD sandbox for consistency
    if (vfd.client?.vfd_account_number) {
      await vfd.sandboxCredit(vfd.client.vfd_account_number, amount);
    }
    // Post to Vestara ledger
    const result = await vestara.deposit(amount);
    if (result) {
      toast({ title: "Account funded!", description: `₦${amount.toLocaleString()} credited via ledger` });
      setTimeout(async () => {
        await refreshVestaraBalance();
        await refreshVestaraTransactions();
        await loadLockData();
      }, 500);
    }
  };

  /* ─── Transfer via Vestara Withdraw ─── */
  const handleTransfer = async (params: {
    fromAccount: string; toAccount: string; bankCode: string;
    amount: number; narration: string; beneficiaryName: string;
  }) => {
    // Debit from Vestara ledger
    const result = await vestara.withdraw(params.amount, `transfer-${crypto.randomUUID().slice(0, 8)}`, {
      to_account: params.toAccount,
      bank_code: params.bankCode,
      narration: params.narration,
      beneficiary_name: params.beneficiaryName,
    });
    if (result?.success) {
      // Also execute VFD transfer
      await vfd.transfer(params);
      await refreshVestaraBalance();
      await refreshVestaraTransactions();
      return result;
    }
    return null;
  };

  /* ─── Lock via Vestara Ledger ─── */
  const handleCreateLock = async (amount: number, duration: number) => {
    const result = await vestara.lockFunds(amount, duration);
    if (result?.success) {
      toast({ title: "Funds Locked!", description: `₦${amount.toLocaleString()} locked for ${duration} months` });
      // Also create in legacy system for UI
      await vfd.createLock(amount, duration);
      await Promise.all([refreshVestaraBalance(), loadLockData()]);
    }
  };

  const handleUnlock = async (lockId: string) => {
    // Find the vestara locked_savings account
    const lockedAccounts = vestara.accounts.filter(a => a.account_type === "locked_savings" && Number(a.balance) > 0);
    if (lockedAccounts.length > 0) {
      await vestara.unlockFunds(lockedAccounts[0].id);
    }
    // Also unlock in legacy
    const result = await vfd.unlockFunds(lockId);
    if (result?.data) {
      toast({ title: "Funds Unlocked!" });
      await Promise.all([refreshVestaraBalance(), loadLockData()]);
    }
  };

  const handleBreakLock = async (lockId: string) => {
    const lockedAccounts = vestara.accounts.filter(a => a.account_type === "locked_savings" && Number(a.balance) > 0);
    if (lockedAccounts.length > 0) {
      await vestara.unlockFunds(lockedAccounts[0].id, 0);
    }
    const result = await vfd.breakLock(lockId);
    if (result?.data) {
      const d = result.data as Record<string, unknown>;
      toast({ title: "Lock Broken", description: `Penalty: ₦${Number(d.penalty).toLocaleString()}` });
      await Promise.all([refreshVestaraBalance(), loadLockData()]);
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
    if (result) {
      const name = result.accountName ||
        ((result.data as Record<string, unknown>)?.data as Record<string, unknown>)?.accountName ||
        ((result.data as Record<string, unknown>)?.data as Record<string, unknown>)?.account_name;
      return name?.toString() || null;
    }
    return null;
  };

  const goBack = () => setCurrentView("dashboard");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Use Vestara ledger balance as primary, fallback to VFD
  const balanceData = {
    totalBalance: vestaraBalance ? vestaraBalance.total_balance : 0,
    availableBalance: vestaraBalance ? vestaraBalance.available_balance : 0,
    lockedBalance: vestaraBalance ? vestaraBalance.locked_balance : 0,
    savingsBalance: vestaraBalance ? vestaraBalance.savings_balance : 0,
    accountNumber: vfd.client?.vfd_account_number || "—",
    fullName: vfd.client?.full_name || "—",
  };

  const ProductWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <SandboxHeader />
      <div className="max-w-lg mx-auto px-4 py-5 pb-32 space-y-5">
        {!kycDone ? (
          <SandboxKYC
            vfd={vfd}
            onComplete={() => {
              setKycDone(true);
              refreshVestaraBalance();
              loadLockData();
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
              <SandboxLockFunds
                lockConfigs={lockConfigs}
                lockedFunds={lockedFunds}
                userBalance={vestaraBalance}
                loading={vfd.loading || vestara.loading}
                onCreateLock={handleCreateLock}
                onUnlock={handleUnlock}
                onBreakLock={handleBreakLock}
                onRefresh={() => { loadLockData(); refreshVestaraBalance(); }}
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
