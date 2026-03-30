import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVfdBanking } from "@/hooks/useVfdBanking";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface LockConfig { id: string; duration_months: number; interest_rate: number; early_withdrawal_penalty: number; }
interface UserBalance { total_balance: number; locked_balance: number; savings_balance: number; available_balance: number; last_synced_at: string | null; }
interface LockedFund { id: string; principal_amount: number; interest_rate: number; duration_months: number; expected_interest: number; total_payout: number; start_date: string; maturity_date: string; actual_unlock_date: string | null; penalty_amount: number; status: string; }

type View = "dashboard" | "fund" | "transfer" | "lock" | "history" | "ajo" | "target" | "goal" | "split";

export default function VfdSandbox() {
  const navigate = useNavigate();
  const { user, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const vfd = useVfdBanking();

  const [kycDone, setKycDone] = useState(false);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [liveBalance, setLiveBalance] = useState<string | null>(null);
  const [banks, setBanks] = useState<Array<{ code: string; name: string }>>([]);

  // Lock state
  const [lockConfigs, setLockConfigs] = useState<LockConfig[]>([]);
  const [userBalance, setUserBalance] = useState<UserBalance | null>(null);
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
        if (result.data.vfd_account_number) {
          void vfd.checkBalance(result.data.vfd_account_number).then((balResult) => {
            if (balResult?.data) {
              const balData = balResult.data as Record<string, unknown>;
              const bal = (balData.data as Record<string, unknown>)?.availableBalance;
              setLiveBalance(bal?.toString() || "0");
            }
          });
        }
        void vfd.getBankList().then((bankResult) => {
          if (bankResult) {
            const bankList = Array.isArray(bankResult.banks) ? bankResult.banks : [];
            if (bankList.length > 0) setBanks(bankList);
          }
        });
        // Load lock data
        loadLockData();
      }
    });
    void vfd.fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, session?.access_token]);

  const refreshBalance = useCallback(async () => {
    if (!vfd.client?.vfd_account_number) return;
    const result = await vfd.checkBalance(vfd.client.vfd_account_number);
    if (result?.data) {
      const balData = result.data as Record<string, unknown>;
      const bal = (balData.data as Record<string, unknown>)?.availableBalance;
      setLiveBalance(bal?.toString() || "0");
    }
  }, [vfd]);

  const loadLockData = useCallback(async () => {
    const [configRes, balanceRes, fundsRes] = await Promise.all([
      vfd.getLockConfigs(),
      vfd.syncBalance(),
      vfd.getLockedFunds(),
    ]);
    if (configRes?.data) setLockConfigs(configRes.data as LockConfig[]);
    if (balanceRes?.data) setUserBalance(balanceRes.data as UserBalance);
    if (fundsRes?.data) setLockedFunds(fundsRes.data as LockedFund[]);
  }, [vfd]);

  const handleFund = async (amount: number) => {
    if (!vfd.client?.vfd_account_number) return;
    const result = await vfd.sandboxCredit(vfd.client.vfd_account_number, amount);
    if (result) {
      toast({ title: "Account funded!", description: `₦${amount.toLocaleString()} credited` });
      setTimeout(async () => {
        await refreshBalance();
        await vfd.fetchTransactions();
        await loadLockData();
      }, 1500);
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

  const handleTransfer = async (params: {
    fromAccount: string; toAccount: string; bankCode: string;
    amount: number; narration: string; beneficiaryName: string;
  }) => {
    const result = await vfd.transfer(params);
    if (result) {
      refreshBalance();
      vfd.fetchTransactions();
      return result;
    }
    return null;
  };

  const handleCreateLock = async (amount: number, duration: number) => {
    const result = await vfd.createLock(amount, duration);
    if (result?.data) {
      toast({ title: "Funds Locked!", description: `₦${amount.toLocaleString()} locked for ${duration} months` });
      await loadLockData();
    }
  };

  const handleUnlock = async (lockId: string) => {
    const result = await vfd.unlockFunds(lockId);
    if (result?.data) {
      toast({ title: "Funds Unlocked!", description: `₦${(result.data as Record<string, unknown>).unlocked?.toLocaleString()} credited` });
      await loadLockData();
      refreshBalance();
    }
  };

  const handleBreakLock = async (lockId: string) => {
    const result = await vfd.breakLock(lockId);
    if (result?.data) {
      const d = result.data as Record<string, unknown>;
      toast({ title: "Lock Broken", description: `Penalty: ₦${Number(d.penalty).toLocaleString()}. Credited: ₦${Number(d.unlocked).toLocaleString()}` });
      await loadLockData();
      refreshBalance();
    }
  };

  const goBack = () => setCurrentView("dashboard");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const balanceData = {
    totalBalance: userBalance ? Number(userBalance.total_balance) : (liveBalance ? parseFloat(liveBalance) : 0),
    availableBalance: userBalance ? Number(userBalance.available_balance) : (liveBalance ? parseFloat(liveBalance) : 0),
    lockedBalance: userBalance ? Number(userBalance.locked_balance) : 0,
    savingsBalance: userBalance ? Number(userBalance.savings_balance) : 0,
    accountNumber: vfd.client?.vfd_account_number || "—",
    fullName: vfd.client?.full_name || "—",
  };

  // Product sub-views with back button wrapper
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
              refreshBalance();
              loadLockData();
            }}
          />
        ) : (
          <>
            {currentView === "dashboard" && (
              <SandboxDashboard balance={balanceData} onNavigate={(v) => setCurrentView(v as View)} />
            )}
            {currentView === "fund" && (
              <SandboxFund
                loading={vfd.loading}
                accountNumber={balanceData.accountNumber}
                onFund={handleFund}
                onBack={goBack}
              />
            )}
            {currentView === "transfer" && (
              <SandboxTransfer
                loading={vfd.loading}
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
                userBalance={userBalance}
                loading={vfd.loading}
                onCreateLock={handleCreateLock}
                onUnlock={handleUnlock}
                onBreakLock={handleBreakLock}
                onRefresh={loadLockData}
                onBack={goBack}
              />
            )}
            {currentView === "history" && (
              <SandboxTransactions
                transactions={vfd.transactions}
                loading={vfd.loading}
                onRefresh={() => vfd.fetchTransactions()}
                onBack={goBack}
              />
            )}
            {currentView === "ajo" && <ProductWrapper><SandboxAjoTab /></ProductWrapper>}
            {currentView === "target" && <ProductWrapper><SandboxTargetTab /></ProductWrapper>}
            {currentView === "goal" && <ProductWrapper><SandboxGoalTab /></ProductWrapper>}
            {currentView === "split" && <ProductWrapper><SandboxSplitTab /></ProductWrapper>}
          </>
        )}
      </div>
    </div>
  );
}
