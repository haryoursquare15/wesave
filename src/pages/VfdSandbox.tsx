import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { syncWelcome } from "@/lib/welcomeCache";
import { cleanCustomerName as __clean } from "@/lib/customerName";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SandboxAuthProvider, useSandboxAuth } from "@/contexts/SandboxAuthContext";
import { SandboxModeContext } from "@/hooks/useSandboxAwareAuth";
import { useVfdBanking } from "@/hooks/useVfdBanking";
import { useVestaraLedger, VestaraLockedFund } from "@/hooks/useVestaraLedger";
import { useToast } from "@/hooks/use-toast";
import { LogOut, MessageCircle, Home, PiggyBank, CreditCard, ChartNoAxesCombined, User, ArrowUpRight, Wallet, Landmark, History, ShieldCheck, Users, Target, ReceiptText, ArrowLeftRight, Layers3, type LucideIcon } from "lucide-react";
import { FluidLoader } from "@/components/FluidLoader";
import { ProfilePictureUpload } from "@/components/settings/ProfilePictureUpload";
import { SandboxHeader } from "@/components/vfd-sandbox/SandboxHeader";
import vestaraLogo from "@/assets/vestara-logo-transparent.png";
import { VestaraSignatureDashboard } from "@/components/vfd-sandbox/VestaraSignatureDashboard";
import { SandboxKYC } from "@/components/vfd-sandbox/SandboxKYC";
import { SandboxSavings } from "@/components/vfd-sandbox/SandboxSavings";
import { SandboxFund } from "@/components/vfd-sandbox/SandboxFund";
import { SandboxTransfer } from "@/components/vfd-sandbox/SandboxTransfer";
import { SandboxWithdraw } from "@/components/vfd-sandbox/SandboxWithdraw";
import { SandboxTransactions } from "@/components/vfd-sandbox/SandboxTransactions";
import { SandboxAjoTab } from "@/components/vfd-sandbox/SandboxAjoTab";
import { SandboxTargetTab } from "@/components/vfd-sandbox/SandboxTargetTab";
import { SandboxGoalTab } from "@/components/vfd-sandbox/SandboxGoalTab";
import { SandboxSplitTab } from "@/components/vfd-sandbox/SandboxSplitTab";
import { SandboxAssociationTab } from "@/components/vfd-sandbox/SandboxAssociationTab";
import { SandboxBillsTab } from "@/components/vfd-sandbox/SandboxBillsTab";
import { SandboxCardTab } from "@/components/vfd-sandbox/SandboxCardTab";
import { SandboxMandatesTab } from "@/components/vfd-sandbox/SandboxMandatesTab";
import { VestaraInsights } from "@/components/vfd-sandbox/VestaraInsights";
import { SandboxProfile } from "@/components/vfd-sandbox/SandboxProfile";
import { SandboxGroupInviteModal } from "@/components/vfd-sandbox/SandboxGroupInviteModal";
import { SandboxSplitInviteModal } from "@/components/vfd-sandbox/SandboxSplitInviteModal";
import { SandboxSplash } from "@/components/vfd-sandbox/SandboxSplash";
import { useSandboxSessionEnforcement } from "@/hooks/useSandboxSessionEnforcement";
import { useDeviceEnforcement } from "@/hooks/useDeviceEnforcement";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";

import { getUserFriendlyError } from "@/lib/errorMessages";
import { cleanCustomerName } from "@/lib/customerName";
import { ComplaintsCenter } from "@/components/vfd-sandbox/complaints/ComplaintsCenter";
interface LockConfig { id: string; duration_months: number; interest_rate: number; early_withdrawal_penalty: number; }
interface UserBalance {
  total_balance: number; locked_balance: number; savings_balance: number; available_balance: number;
  no_vfd_account?: boolean; stale?: boolean;
}

type View = "dashboard" | "fund" | "transfer" | "withdraw" | "lock" | "history" | "ajo" | "target" | "goal" | "split" | "association" | "bills" | "card" | "kyc" | "mandates" | "insights" | "profile";
type ScreenIntro = { eyebrow: string; title: string; description: string; icon: LucideIcon };
const screenIntros: Partial<Record<View, ScreenIntro>> = {
  fund: { eyebrow: "Wallet", title: "Add money", description: "Your money starts here. Fund your Vestara account in a few simple steps.", icon: Wallet },
  transfer: { eyebrow: "Payments", title: "Send money", description: "Move money confidently, with every detail in your control.", icon: ArrowLeftRight },
  withdraw: { eyebrow: "Wallet", title: "Withdraw funds", description: "Move available funds to your linked bank account.", icon: Landmark },
  history: { eyebrow: "Activity", title: "Your money, in motion", description: "A clearer record of every deposit, transfer and payment.", icon: History },
  lock: { eyebrow: "Wealth", title: "Build what’s next", description: "Purposeful savings for all the things worth planning for.", icon: PiggyBank },
  ajo: { eyebrow: "Community", title: "Better together", description: "Save as a group, contribute with clarity and keep the circle moving.", icon: Users },
  target: { eyebrow: "Wealth", title: "Target savings", description: "A plan for the milestones ahead.", icon: Target },
  goal: { eyebrow: "Wealth", title: "Shared goals", description: "Give meaningful goals a place to grow.", icon: Target },
  association: { eyebrow: "Community", title: "Associations", description: "Where contributions, members and plans come together.", icon: Users },
  split: { eyebrow: "Payments", title: "Make it a shared bill", description: "The easy way to bring everyone into the payment.", icon: ReceiptText },
  bills: { eyebrow: "Payments", title: "Everyday essentials", description: "All the payments that keep your day moving.", icon: CreditCard },
  card: { eyebrow: "Payments", title: "Your cards", description: "A considered way to manage payment options.", icon: CreditCard },
  kyc: { eyebrow: "Account", title: "Account verification", description: "Keep your account details complete and protected.", icon: ShieldCheck },
  mandates: { eyebrow: "Payments", title: "Recurring payments", description: "Stay in control of the payments that happen automatically.", icon: Layers3 },
  insights: { eyebrow: "Insights", title: "Know your numbers", description: "Perspective on where your money goes and how it grows.", icon: ChartNoAxesCombined },
  profile: { eyebrow: "Your account", title: "Profile", description: "Manage your personal details, preferences and security.", icon: User },
};

function ProductWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="premium-service-page space-y-4">
      {children}
    </div>
  );
}

const VALID_VIEWS: View[] = ["dashboard", "fund", "transfer", "withdraw", "lock", "history", "ajo", "target", "goal", "split", "association", "bills", "card", "kyc", "mandates", "insights", "profile"];

function VfdSandboxInner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session, loading: authLoading, signOut } = useSandboxAuth();
  const { toast } = useToast();
  const vfd = useVfdBanking();
  const vestara = useVestaraLedger();
  const fetchVfdTransactions = vfd.fetchTransactions;
  const getVfdUserBalance = vfd.getUserBalance;
  const getVestaraBalanceSummary = vestara.getBalanceSummary;
  const getVestaraLockedFunds = vestara.getLockedFunds;
  const fetchVestaraTransactions = vestara.fetchTransactions;

  const [kycDone, setKycDone] = useState(false);
  const [clientChecked, setClientChecked] = useState(false);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const workspaceRef = useRef<HTMLDivElement>(null);
  // The workspace owns scrolling; keep each new destination at its beginning.
  // This also prevents an apparent navigation jump when leaving a long page.
  useLayoutEffect(() => {
    if (workspaceRef.current) workspaceRef.current.scrollTop = 0;
  }, [currentView]);
  const [initialSavingsProduct, setInitialSavingsProduct] = useState<string | null>(null);
  const [banks, setBanks] = useState<Array<{ code: string; name: string }>>([]);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadPhoto = () => {
      void sandboxSupabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (active) setAvatarUrl(data?.avatar_url || null); });
    };
    loadPhoto();
    window.addEventListener("vestara:profile-updated", loadPhoto);
    return () => { active = false; window.removeEventListener("vestara:profile-updated", loadPhoto); };
  }, [user?.id]);
  // Keep the PIN sign-in welcome (first name + photo) in sync with this account.
  useEffect(() => {
    if (vfd.client?.full_name || avatarUrl) syncWelcome(__clean(vfd.client?.full_name), avatarUrl);
  }, [vfd.client?.full_name, avatarUrl]);

  // Deep-link support: /app?view=lock (or ajo|target|split|...) opens that
  // section directly so menu links land on the right screen.
  useEffect(() => {
    const v = searchParams.get("view") as View | null;
    if (v && VALID_VIEWS.includes(v)) {
      const product = searchParams.get("product");
      if (product) setInitialSavingsProduct(product);
      setCurrentView(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Safety net: a stale session can make a background edge call reject with
  // "session expired". Never let that blank the screen — sign out cleanly.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e.reason as Error)?.message || e.reason || "");
      if (/session has expired|session has ended|non-2xx|edge function returned 4/i.test(msg)) {
        e.preventDefault();
        sessionStorage.removeItem("vestara_sandbox_signed_in");
        void signOut().finally(() => navigate("/signin"));
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inactivity sign-out (2m foreground / 5m background) → /signin
  useSandboxSessionEnforcement({ enabled: !!user });
  // Single-device enforcement: register fingerprint + sign out if evicted elsewhere.
  useDeviceEnforcement(!!user);

  // Vestara-driven balance (single source of truth)
  const [vestaraBalance, setVestaraBalance] = useState<UserBalance | null>(null);

  // Vestara-driven locked funds
  const [vestaraLockedFunds, setVestaraLockedFunds] = useState<VestaraLockedFund[]>([]);

  // Lock configs from vfd-banking (read-only config data)
  const [lockConfigs, setLockConfigs] = useState<LockConfig[]>([]);

  // Splash must never auto-log-in. If the user lands here without explicitly
  // signing in this browser session, force them through the auth page.
  // NOTE: deps intentionally exclude `signOut`/`navigate` to avoid re-firing
  // on every auth-state re-render (which was resetting `currentView` back to
  // "dashboard" mid-flow while users were filling product forms).
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/signin");
      return;
    }
    if (!sessionStorage.getItem("vestara_sandbox_signed_in")) {
      void signOut().finally(() => navigate("/signin"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const initRef = useRef(false);
  useEffect(() => {
    if (authLoading || !user || !session?.access_token || initRef.current) return;
    initRef.current = true;

    void vfd.fetchClient().then(async (result) => {
      // KYC is considered complete once the account is active for any tier.
      // Per-user NUBAN provisioning happens silently in the background — we
      // never force the user back through an upgrade flow just because the
      // sandbox echoed the pool NUBAN on a previous attempt.
      const client = result?.data as Record<string, unknown> | undefined;
      const isActive = client?.account_status === "active";
      const hasNuban = !!client?.vfd_account_number;

      if (isActive) {
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

        // Silently provision a per-user NUBAN if missing (no UI interruption).
        if (!hasNuban) {
          const bvn = (client?.bvn as string | undefined) ?? undefined;
          const nin = (client?.nin as string | undefined) ?? undefined;
          const dob = (client?.date_of_birth as string | undefined) ?? "";
          const address = (client?.address as string | undefined) ?? undefined;
          if (dob && (bvn || nin)) {
            void vfd.createTiered({ bvn, nin, dateOfBirth: dob, address })
              .then(() => vfd.fetchClient())
              .catch(() => { /* non-blocking */ });
          }
        }
      }
      setClientChecked(true);
    });

    // Initialize Vestara accounts & load balance
    refreshVestaraBalance();
    refreshVestaraTransactions();
    refreshVestaraLockedFunds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, session?.access_token]);

  /* ─── Balance: Vestara ledger wallet + locked savings/interest ───
   * The backend returns the ledger-derived wallet balance as the display
   * truth for every user (real or virtual NUBAN). `no_vfd_account` is only
   * informational — it must NOT zero out the balance.
   */
  const refreshVestaraBalance = useCallback(async () => {
    const vfdRes = await getVfdUserBalance();
    const vfdData = (vfdRes?.data as {
      available_balance?: number;
      no_vfd_account?: boolean;
      stale?: boolean;
    } | null) ?? null;

    const noVfdAccount = !!vfdData?.no_vfd_account;
    const stale = !!vfdData?.stale;
    const vfdWallet = Math.max(Number(vfdData?.available_balance ?? 0), 0);

    // Vestara still owns locked savings + accrued interest (VFD doesn't model these).
    const summary = await getVestaraBalanceSummary();
    const locked = Number(summary?.locked_savings ?? 0);
    const interest = Number(summary?.accrued_interest ?? 0);

    setVestaraBalance({
      total_balance: vfdWallet + locked + interest,
      available_balance: vfdWallet,
      locked_balance: locked,
      savings_balance: interest,
      no_vfd_account: noVfdAccount,
      stale,
    });
  }, [getVestaraBalanceSummary, getVfdUserBalance]);


  /* ─── Vestara Locked Funds ─── */
  const refreshVestaraLockedFunds = useCallback(async () => {
    const funds = await getVestaraLockedFunds();
    setVestaraLockedFunds(funds);
  }, [getVestaraLockedFunds]);

  /* ─── Vestara Transactions ─── */
  const refreshVestaraTransactions = useCallback(async () => {
    await fetchVestaraTransactions();
  }, [fetchVestaraTransactions]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId || !session?.access_token || !kycDone) return;

    // Initial fetch so VFD reference + session id are available even before
    // any realtime event fires (e.g. opening history right after page load).
    void fetchVfdTransactions();


    const refreshNow = () => {
      void Promise.all([
        refreshVestaraBalance(),
        refreshVestaraTransactions(),
        fetchVfdTransactions(),
      ]);
    };

    const channel = sandboxSupabase
      .channel(`vestara-instant-settlement-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vestara_transactions",
          filter: `initiated_by=eq.${userId}`,
        },
        refreshNow,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vfd_sandbox_transactions",
          filter: `user_id=eq.${userId}`,
        },
        refreshNow,
      )
      .subscribe();

    // Force a fresh VFD enquiry whenever the tab regains focus or becomes
    // visible, so the displayed balance always reflects the actual VFD
    // figure rather than any cached value the user last saw.
    const onFocus = () => refreshNow();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshNow();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      void sandboxSupabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id, session?.access_token, kycDone, refreshVestaraBalance, refreshVestaraTransactions, fetchVfdTransactions]);

  // Map vestara transactions — show net amount and platform fee for payouts.
  // Also enrich with VFD reference + NIBSS session id (looked up by reference)
  // so each receipt row carries the bank-side identifiers.
  const vfdRefIndex = new Map<string, { vfd_reference: string | null; session_id: string | null }>();
  for (const v of vfd.transactions) {
    if (v.reference) {
      vfdRefIndex.set(v.reference, { vfd_reference: v.vfd_reference, session_id: v.session_id });
    }
  }

  const mappedTransactions = vestara.transactions.flatMap((tx) => {
    const meta = (tx.metadata || {}) as Record<string, unknown>;
    const fee = Number(meta.fee || 0);
    const gross = Number(tx.amount);
    const isPayout = tx.type === "thrift_payout";
    const net = isPayout && fee > 0 ? gross - fee : gross;
    const vfdMeta = (tx.reference && vfdRefIndex.get(tx.reference)) || { vfd_reference: null, session_id: null };

    // Surface the richest context we have on the ledger row so history labels
    // can say what the movement was actually for.
    const metaStr = (k: string) => {
      const v = meta[k];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const contextName =
      metaStr("group_name") || metaStr("product_name") || metaStr("campaign_title") ||
      metaStr("bill_name") || metaStr("product_code") || metaStr("source");
    const richDescription = [tx.type.replace(/_/g, " "), contextName].filter(Boolean).join(" — ");

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
      description: richDescription,
      reference: tx.reference,
      vfd_reference: vfdMeta.vfd_reference,
      session_id: vfdMeta.session_id,
      beneficiary_name: metaStr("beneficiary_name"),
      beneficiary_account: metaStr("to_account"),
      status: tx.status,
      created_at: tx.created_at,
      // Payout shows as one net row; gross + fee appear in its detail view.
      gross_amount: isPayout && fee > 0 ? gross : null,
      fee_amount: isPayout && fee > 0 ? fee : null,
    };
    return [base];
  });

  /* ─── Transfer ───
   * The vfd-banking edge function is the single source of truth: it atomically
   * debits the sender wallet (via vestara_withdraw or the intra-virtual
   * short-circuit) and credits the recipient/settlement. We must NOT wrap this
   * with a client-side transferInitiate/transferComplete pending-pattern, or
   * the sender wallet gets debited twice (once by the client hold, once by
   * the edge function) and a third holding→settlement entry shows up in the
   * user's history. See: money-movement-model.md.
   */
  const handleTransfer = async (params: {
    fromAccount: string; toAccount: string; bankCode: string;
    amount: number; narration: string; beneficiaryName: string;
  }) => {
    const vfdResult = await vfd.transfer(params) as { data?: { status?: string; message?: string } } | null;
    const vfdSucceeded = vfdResult?.data?.status === "00";

    if (vfdSucceeded) {
      toast({ title: "Transfer successful!" });
    }

    await refreshVestaraBalance();
    await refreshVestaraTransactions();
    // Let the SpendLock card recount what has been spent in this window.
    window.dispatchEvent(new Event("vestara:spendlock-updated"));
    return vfdResult;
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
      toast({ title: "Verification failed", description: getUserFriendlyError(String(result.error)), variant: "destructive" });
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

  // Screen transition direction: forward slides in from the right, back from the left.
  const navDir = useRef(1);
  const goBack = () => { navDir.current = -1; setCurrentView("dashboard"); setTimeout(() => { navDir.current = 1; }, 300); };

  // Never paint onboarding/dashboard until we know the user is signed in this
  // session and their account status is loaded — prevents a flash before the
  // redirect to sign-in.
  const signedInThisSession = typeof window !== "undefined" && !!sessionStorage.getItem("vestara_sandbox_signed_in");
  if (authLoading || !user || !signedInThisSession || !clientChecked) {
    return <FluidLoader />;
  }

  // VFD live balance is the source of truth for the spendable wallet.
  const balanceData = {
    totalBalance: vestaraBalance ? vestaraBalance.total_balance : 0,
    availableBalance: vestaraBalance ? vestaraBalance.available_balance : 0,
    lockedBalance: vestaraBalance ? vestaraBalance.locked_balance : 0,
    savingsBalance: vestaraBalance ? vestaraBalance.savings_balance : 0,
    accountNumber: vfd.client?.vfd_account_number || "—",
    fullName: cleanCustomerName(vfd.client?.full_name) || "—",
    noVfdAccount: vestaraBalance ? !!vestaraBalance.no_vfd_account : false,
    stale: vestaraBalance ? !!vestaraBalance.stale : false,
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

  return (
    <div data-view={currentView} className="vestara-app at-shell v4-app vm-app signature-shell h-[100dvh] min-h-0 flex flex-col overflow-hidden">
      {kycDone && <aside className="at-sidebar vm-sidebar signature-sidebar" aria-label="Main navigation">
        <div className="at-sidebar-brand vm-sidebar-brand">
          <div><img src={vestaraLogo} alt="Vestara" /></div>
        </div>
        
        <div className="at-sidebar-section vm-sidebar-section"><span>MAIN</span>
          {[
            {key:"dashboard",label:"Overview",icon:Home,action:() => setCurrentView("dashboard")},
            {key:"lock",label:"Savings",icon:PiggyBank,action:() => {setInitialSavingsProduct(null);setCurrentView("lock");}},
            {key:"bills",label:"Payments",icon:CreditCard,action:() => setCurrentView("bills")},
            {key:"insights",label:"Money Pulse",icon:ChartNoAxesCombined,action:() => setCurrentView("insights")},
            {key:"history",label:"Activity",icon:History,action:() => setCurrentView("history")},
          ].map(entry => (
            <button type="button" key={entry.key} aria-current={currentView===entry.key ? "page" : undefined} onClick={entry.action}>
              <entry.icon size={19} strokeWidth={1.75}/>{entry.label}
              {currentView===entry.key && <span className="at-sidebar-active-dot"/>}
            </button>
          ))}
        </div>
        <div className="at-sidebar-section at-sidebar-more vm-sidebar-section"><span>ACCOUNT</span>
          <button type="button" onClick={() => setCurrentView("profile")} aria-current={currentView==="profile"?"page":undefined}><User size={19}/> My account</button>
          <button type="button" onClick={() => setCurrentView("ajo")} aria-current={currentView==="ajo"?"page":undefined}><Users size={19}/> Ajo & Esusu</button>
        </div>
        <div className="at-sidebar-footer vm-sidebar-footer"><ShieldCheck size={18}/><span>Securely powered by<br />VFD Microfinance Bank</span></div>
      </aside>}
      <SandboxHeader
        showBack={currentView !== "dashboard"}
        onBack={goBack}
        right={
          <Button variant="ghost" size="icon" aria-label="Open profile" onClick={() => setCurrentView("profile")} className="clean-account-trigger">
            <User size={20} strokeWidth={1.7} />
          </Button>
        }
      />
      <ProfilePictureUpload open={photoOpen} onOpenChange={setPhotoOpen} />
      {kycDone && <SandboxGroupInviteModal onAccepted={() => { /* downstream UIs poll on their own */ }} />}
      {kycDone && <SandboxSplitInviteModal onOpenSplit={() => { setCurrentView("split"); window.dispatchEvent(new Event("vestara:open-split")); }} />}
      <main ref={workspaceRef} id="vestara-workspace" className="vestara-app-scroll at-workspace vm-workspace signature-workspace min-h-0 flex-1 overflow-y-auto overscroll-contain w-full mx-auto">
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
          <div
            key={currentView}
            className={`premium-app-page at-page vm-app-page vv-app-page signature-page ${currentView === "dashboard" ? "vv-home-page" : "vv-app-module"}`}
            data-vv-view={currentView}
          >
            {currentView !== "dashboard" && screenIntros[currentView] && (() => {
              const screen = screenIntros[currentView]!;
              const Icon = screen.icon;
              return (
                <header className="clean-module-heading" aria-label={screen.title}>
                  <button type="button" className="clean-module-back" onClick={() => setCurrentView("dashboard")}>
                    <ArrowLeft size={15} strokeWidth={1.7}/> Back to home
                  </button>
                  <div className="clean-module-title">
                    <div>
                      <span className="clean-module-category">{screen.eyebrow}</span>
                      <h1>{screen.title}</h1>
                      <p>{screen.description}</p>
                    </div>
                    <span className="clean-module-icon" aria-hidden="true"><Icon size={24} strokeWidth={1.5}/></span>
                  </div>
                </header>
              );
            })()}
            {currentView === "dashboard" && (
              <VestaraSignatureDashboard
                balance={balanceData}
                onNavigate={(v) => {
                  const [view, productCode] = String(v).split(":");
                  setInitialSavingsProduct(productCode || null);
                  setCurrentView(view as View);
                }}
                recentTransactions={mappedTransactions}
                tier={vfd.client?.tier}
                upgradePending={vfd.client?.kyc_review_status === "pending" && !!vfd.client?.kyc_requested_tier}
              />
            )}
            {currentView === "kyc" && (
              <SandboxKYC
                vfd={vfd}
                onComplete={() => {
                  setCurrentView("dashboard");
                  refreshVestaraBalance();
                  refreshVestaraLockedFunds();
                }}
              />
            )}
            {currentView === "fund" && (
              <SandboxFund
                loading={vfd.loading || vestara.loading}
                accountNumber={balanceData.accountNumber}
                bankName="VFD Microfinance Bank"
                fullName={balanceData.fullName}
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
            {currentView === "withdraw" && (
              <SandboxWithdraw
                userId={user?.id || ""}
                accountNumber={balanceData.accountNumber}
                availableBalance={vestaraBalance?.available_balance ?? 0}
                onWithdraw={handleTransfer}
                onBack={goBack}
                onSetupBank={() => setCurrentView("profile")}
              />
            )}
            {currentView === "lock" && (
              <SandboxSavings
                userBalance={vestaraBalance}
                onRefresh={() => { refreshVestaraBalance(); refreshVestaraTransactions(); }}
                onBack={() => { setInitialSavingsProduct(null); goBack(); }}
                initialProductCode={initialSavingsProduct}
              />
            )}
            {currentView === "history" && (
              <SandboxTransactions
                transactions={mappedTransactions}
                loading={vestara.loading}
                onRefresh={() => { void refreshVestaraTransactions(); void fetchVfdTransactions(); }}
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
            {currentView === "mandates" && <ProductWrapper><SandboxMandatesTab /></ProductWrapper>}
            <ComplaintsCenter />
            {currentView === "profile" && (
              <SandboxProfile
                userId={user?.id}
                email={user?.email}
                client={vfd.client}
                avatarUrl={avatarUrl}
                banks={banks}
                onLoadBanks={handleLoadBanks}
                onValidateBeneficiary={handleValidateBeneficiary}
                onChangePhoto={() => setPhotoOpen(true)}
                onNavigate={(v) => setCurrentView(v as View)}
                onSignOut={async () => { await signOut(); navigate("/signin"); }}
              />
            )}
            {currentView === "insights" && (
              <VestaraInsights
                name={balanceData.fullName}
                onNavigate={(view, product) => {
                  if (VALID_VIEWS.includes(view as View)) {
                    setInitialSavingsProduct(product ?? null);
                    setCurrentView(view as View);
                  }
                }}
              />
            )}
          </div>
        )}
      </main>
      {kycDone && (
        <nav aria-label="Main" className="vestara-bottom-nav at-bottom-nav vm-dock clean-bottom-nav shrink-0 z-30">
          <div className="vestara-bottom-tabs vm-dock-tabs grid grid-cols-5">
            {([
              { label: "Home", icon: Home, active: currentView === "dashboard", go: () => setCurrentView("dashboard") },
              { label: "Save", icon: PiggyBank, active: currentView === "lock" || currentView === "target" || currentView === "goal", go: () => { setInitialSavingsProduct(null); setCurrentView("lock"); } },
              { label: "Pay", icon: CreditCard, active: currentView === "bills" || currentView === "transfer" || currentView === "withdraw" || currentView === "fund" || currentView === "split", go: () => setCurrentView("bills") },
              { label: "Insights", icon: ChartNoAxesCombined, active: currentView === "insights", go: () => setCurrentView("insights") },
              { label: "Profile", icon: User, active: currentView === "profile" || currentView === "kyc", go: () => setCurrentView("profile") },
            ]).map((t) => (
              <button
                key={t.label}
                onClick={t.go}
                aria-current={t.active ? "page" : undefined}
                className={`vestara-bottom-tab vm-dock-tab ${t.active ? "vm-dock-active" : ""}`}
              >
                <span className="v4-nav-icon vm-dock-icon"><t.icon className="h-[21px] w-[21px]" strokeWidth={t.active ? 2.1 : 1.7} /></span>
                <span className="vm-dock-caption">{t.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

/**
 * Provides the sandbox session to all hooks via SandboxModeContext, so that
 * useVfdBanking / useVestaraLedger talk to the sandbox Supabase client (and
 * the sandbox-authenticated user) instead of the main Vestara session.
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
    <MotionConfig reducedMotion="user">
      <SandboxAuthProvider>
        <SandboxSessionBridge>
          <VfdSandboxInner />
        </SandboxSessionBridge>
      </SandboxAuthProvider>
    </MotionConfig>
  );
}
