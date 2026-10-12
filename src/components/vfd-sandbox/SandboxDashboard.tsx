import { motion, AnimatePresence , useReducedMotion} from "framer-motion";
import { haptic } from "@/lib/haptics";
import { press, spring } from "@/lib/motion";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Wallet, Lock, Users, Target, Heart, Receipt, Send, LayoutGrid,
  CreditCard, Eye, EyeOff, TrendingUp, Plus, ArrowDownLeft, ArrowUpRight, Banknote,
  Shield, ChevronRight, ChevronLeft, PiggyBank,
  Clock, Copy, Check, Building2, Vault as VaultIcon, Zap, Gift, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import vestaraBadge from "@/assets/vestara-v.png.asset.json";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { describeTransaction } from "@/lib/transactionLabels";
import { supabase } from "@/integrations/supabase/client";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { SpendLockCard } from "@/components/vfd-sandbox/SpendLockCard";

interface BalanceData {
  totalBalance: number;
  availableBalance: number;
  lockedBalance: number;
  savingsBalance: number;
  accountNumber: string;
  fullName: string;
  noVfdAccount?: boolean;
  stale?: boolean;
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  description: string | null;
  reference: string | null;
  status: string;
  created_at: string;
}

interface SandboxDashboardProps {
  balance: BalanceData;
  onNavigate: (tab: string) => void;
  recentTransactions?: Transaction[];
  tier?: string | null;
  upgradePending?: boolean;
  avatarUrl?: string | null;
}

const TIER_INFO: Record<string, { short: string; daily: string }> = {
  tier1: { short: "Tier 1", daily: "₦30k" },
  tier2: { short: "Tier 2", daily: "₦100k" },
  tier3: { short: "Tier 3", daily: "₦5M" },
};

/* ─── Animated Counter ─── */
// Counts up over 600ms once per session; later changes update instantly.
const COUNTED_KEY = "vestara_balance_counted";
function AnimatedNumber({ value, prefix = "₦" }: { value: number; prefix?: string }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() =>
    reduce || sessionStorage.getItem(COUNTED_KEY) ? value : 0,
  );

  useEffect(() => {
    if (reduce || sessionStorage.getItem(COUNTED_KEY) || value === 0) { setDisplay(value); return; }
    let raf = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - startTime) / 600, 1);
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
      else sessionStorage.setItem(COUNTED_KEY, "1");
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);

  return <>{prefix}{display.toLocaleString()}</>;
}

/* ─── Product Banners Data ─── */
const productBanners = [
  {
    key: "goalsave",
    routeKey: "lock:goalsave",
    title: "GoalSave",
    subtitle: "Flexible savings • Earn 10–16% p.a. • 90–365 days",
    cta: "Start GoalSave",
    gradient: "from-blue-600 to-cyan-700",
    icon: Target,
    accent: "bg-blue-400/20",
  },
  {
    key: "vault",
    routeKey: "lock:vault",
    title: "Vault",
    subtitle: "Higher yield safe • Earn 14–20.5% p.a. • 30–365 days",
    cta: "Open a Vault",
    gradient: "from-emerald-600 to-green-700",
    icon: VaultIcon,
    accent: "bg-emerald-400/20",
  },
  {
    key: "lockmax",
    routeKey: "lock:lockmax",
    title: "LockMax",
    subtitle: "Maximum returns • Earn 18–21% p.a. • 90–365 days",
    cta: "Lock for Max",
    gradient: "from-purple-600 to-fuchsia-700",
    icon: Zap,
    accent: "bg-purple-400/20",
  },
  {
    key: "upfront_yield",
    routeKey: "lock:upfront_yield",
    title: "Upfront Yield",
    subtitle: "Get your interest paid up front • 12–18% p.a.",
    cta: "Earn Upfront",
    gradient: "from-amber-600 to-orange-700",
    icon: Gift,
    accent: "bg-amber-300/20",
  },
];

/* ─── Services: grouped categories ───
   Primary categories only at the top level. Lower-frequency destinations
   (Associations, crowdfunding, Virtual Card) live one level deeper inside
   their category. Products that are not live yet keep their disabled state. */
type ServiceChild = {
  key: string;
  label: string;
  icon: typeof CreditCard;
  desc: string;
  comingSoon?: boolean;
};
type ServiceCategory = {
  key: string;
  label: string;
  icon: typeof CreditCard;
  color: string;
  desc: string;
  comingSoon?: boolean;
  navKey?: string;          // direct-action category (no children)
  children?: ServiceChild[];
};

const serviceCategories: ServiceCategory[] = [
  {
    key: "bills-payments",
    label: "Bills & Payments",
    icon: CreditCard,
    color: "bg-primary-soft text-primary",
    desc: "Airtime, utilities, split",
    children: [
      { key: "bills", label: "Pay Bills", icon: CreditCard, desc: "Airtime, data & utilities" },
      { key: "split", label: "Split Bills", icon: Receipt, desc: "Share costs with others" },
      { key: "card", label: "Virtual Card", icon: CreditCard, desc: "Coming soon", comingSoon: true },
    ],
  },
  {
    key: "save-invest",
    label: "Save & Invest",
    icon: PiggyBank,
    color: "bg-primary-soft text-primary",
    desc: "Savings & goals",
    children: [
      { key: "lock", label: "Active Savings", icon: Lock, desc: "View all your holdings" },
      { key: "lock:goalsave", label: "Goal Save", icon: Target, desc: "Installment savings" },
      { key: "mandates", label: "My E-Mandates", icon: ShieldCheck, desc: "Setup, amount, dates & status" },
      { key: "goal", label: "Crowdfunding", icon: Heart, desc: "Coming soon", comingSoon: true },
    ],
  },
  {
    key: "ajo-groups",
    label: "Ajo Groups",
    icon: Users,
    color: "bg-primary-soft text-primary",
    desc: "Rotating savings",
    children: [
      { key: "ajo", label: "My Ajo Groups", icon: Users, desc: "Rotating savings" },
      { key: "association", label: "Associations", icon: Building2, desc: "Coming soon", comingSoon: true },
    ],
  },
];



/* ─── Transaction Icon Helper ─── */
function getTxMeta(type: string) {
  switch (type) {
    case "credit": return { icon: ArrowDownLeft, bg: "bg-success/10", color: "text-success", sign: "+" };
    case "debit": return { icon: ArrowUpRight, bg: "bg-destructive/10", color: "text-destructive", sign: "-" };
    case "lock": return { icon: Lock, bg: "bg-warning/10", color: "text-warning", sign: "-" };
    case "unlock": return { icon: ArrowDownLeft, bg: "bg-success/10", color: "text-success", sign: "+" };
    case "savings": return { icon: PiggyBank, bg: "bg-primary/10", color: "text-primary", sign: "-" };
    case "interest": return { icon: TrendingUp, bg: "bg-success/10", color: "text-success", sign: "+" };
    default: return { icon: CreditCard, bg: "bg-muted", color: "text-muted-foreground", sign: "" };
  }
}

/* ─── Main Dashboard Component ─── */
export function SandboxDashboard({ balance, onNavigate, recentTransactions = [], tier, upgradePending = false, avatarUrl }: SandboxDashboardProps) {
  const [showBalance, setShowBalance] = useState(true);
  const [tapped, setTapped] = useState<{ key: string; n: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeBanner, setActiveBanner] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  // Per-product aggregate holdings (product_code → { total, count }) shown on
  // each product banner so users can see what they already have at a glance.
  const [holdings, setHoldings] = useState<Record<string, { total: number; count: number }>>({});
  const bannerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { client, session } = useSandboxAwareAuth();

  useEffect(() => {
    let cancelled = false;
    const uid = session?.user?.id;
    if (!uid) { setHoldings({}); return; }
    (async () => {
      const { data } = await client
        .from("vestara_savings")
        .select("product_code, principal, accrued_interest, status, approval_status, activation_status")
        .eq("user_id", uid)
        .in("status", ["active", "matured"])
        .eq("approval_status", "approved")
        .eq("activation_status", "active");
      if (cancelled || !data) return;
      const agg: Record<string, { total: number; count: number }> = {};
      for (const row of data as any[]) {
        const code = row.product_code as string;
        if (!code) continue;
        // Only money that has ACTUALLY moved counts. `principal` is written
        // when funds land in the product sub-account; commitment / original
        // amounts are just intentions on a mandate and must never be shown as
        // holdings (that is what inflated the goal card to NGN 21,000).
        const funded = Number(row.principal || 0);
        if (funded <= 0) continue;
        const prev = agg[code] || { total: 0, count: 0 };
        prev.total += funded + Number(row.accrued_interest || 0);
        prev.count += 1;
        agg[code] = prev;
      }
      setHoldings(agg);

    })();
    return () => { cancelled = true; };
  }, [client, session?.user?.id]);


  const moveBanner = useCallback((nextIndex: number) => {
    const normalized = Math.max(0, Math.min(productBanners.length - 1, nextIndex));
    setActiveBanner(normalized);
    const carousel = bannerRef.current;
    const card = carousel?.children[normalized] as HTMLElement | undefined;
    if (carousel && card) carousel.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
  }, []);

  // Auto-scroll banners until the customer starts swiping them manually.
  useEffect(() => {
    if (carouselPaused) return;
    const interval = setInterval(() => {
      setActiveBanner((prev) => (prev + 1) % productBanners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [carouselPaused]);

  // Move only the horizontal savings carousel. `scrollIntoView` also moves the
  // page vertically, which pulled customers back to this section every 5s.
  useEffect(() => {
    if (carouselPaused) return;
    if (bannerRef.current) {
      const card = bannerRef.current.children[activeBanner] as HTMLElement;
      if (card) {
        const left = card.offsetLeft - (bannerRef.current.clientWidth - card.clientWidth) / 2;
        bannerRef.current.scrollTo({ left: Math.max(left, 0), behavior: "smooth" });
      }
    }
  }, [activeBanner, carouselPaused]);

  const copyAccount = useCallback(() => {
    if (balance.accountNumber && balance.accountNumber !== "—") {
      navigator.clipboard.writeText(balance.accountNumber);
      setCopied(true);
      toast({ title: "Copied!", description: "Account number copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [balance.accountNumber, toast]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = (() => {
    let raw = balance.fullName?.trim();
    if (!raw || raw === "—") return "there";
    // VFD returns the NUBAN's registered name with the corporate prefix
    // baked into `firstname` (e.g. "WeSave Ng Ltd-SAMIR ADEBAYO ALAMUKII").
    // Strip anything before the last hyphen so we greet the human, not the org.
    if (raw.includes("-")) raw = raw.slice(raw.lastIndexOf("-") + 1).trim();
    const first = raw.split(/\s+/)[0];
    if (!first) return "there";
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  })();

  // Interim cosmetic mask: VFD registers sub-accounts as "<Corporate>-<NAME>".
  // Until VFD updates the merchant name, hide the legacy corporate prefix.
  const displayAccountName = (() => {
    const raw = balance.fullName?.trim();
    if (!raw || raw === "—") return raw || "—";
    return raw.includes("-") ? raw.slice(raw.lastIndexOf("-") + 1).trim() : raw;
  })();

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center gap-3"
      >
        <Avatar className="h-12 w-12 shrink-0 ring-2 ring-primary/20">
          <AvatarImage src={avatarUrl || undefined} alt="Your profile photo" className="object-cover" />
          <AvatarFallback className="bg-background"><img src={vestaraBadge.url} alt="Vestara" className="h-9 w-9 object-contain" /></AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="text-xl font-bold text-foreground">{firstName} 👋</h1>
        </div>
      </motion.div>

      {/* ═══ BALANCE CARD ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-md"
      >
        {/* Decorative circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary-foreground/[0.06]" />
          <div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-primary-foreground/[0.04]" />
          <div className="absolute right-1/4 top-1/2 h-20 w-20 rounded-full bg-primary-foreground/[0.03]" />
        </div>

        <div className="relative z-10">
          {/* Top row */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 opacity-70" />
              <span className="text-xs font-medium opacity-70 tracking-wide uppercase">Total Balance</span>
            </div>
            <motion.button
              whileTap={press}
              transition={spring}
              onClick={() => setShowBalance(!showBalance)}
              className="p-1.5 hover:bg-primary-foreground/10 rounded-full transition-colors"
              aria-label={showBalance ? "Hide balance" : "Show balance"}
            >
              {showBalance ? <Eye className="h-4 w-4 opacity-70" /> : <EyeOff className="h-4 w-4 opacity-70" />}
            </motion.button>
          </div>

          {/* Primary figure — Total (crossfade with a light blur) */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.h2
              key={showBalance ? "shown" : "hidden"}
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="text-[2.5rem] font-semibold tracking-tight mb-3 leading-none"
            >
              {showBalance ? <AnimatedNumber value={balance.totalBalance} /> : "₦ ••••••"}
            </motion.h2>
          </AnimatePresence>



          {balance.noVfdAccount && (
            <p className="text-[11px] opacity-80 mb-3 leading-snug">
              No VFD account yet — complete KYC to activate your unique NUBAN and start receiving funds.
            </p>
          )}
          {!balance.noVfdAccount && balance.stale && (
            <p className="text-[11px] opacity-80 mb-3 leading-snug">
              Live balance unavailable — showing last known figure. Pull to refresh.
            </p>
          )}


          {/* Account number — never show the platform pool (1001695610) as a user NUBAN */}
          {(() => {
            const POOL = "1001695610";
            const acct = balance.accountNumber;
            const hasRealNuban = acct && acct !== "—" && acct !== POOL;
            if (!hasRealNuban) {
              return (
                <button
                  onClick={() => onNavigate("kyc")}
                  className="flex flex-col items-start gap-0.5 text-xs opacity-90 hover:opacity-100 transition-opacity mb-4 text-left"
                >
                  <span className="text-[10px] uppercase tracking-wider opacity-60">
                    Your VFD account number
                  </span>
                  <span className="flex items-center gap-1.5 font-mono font-semibold tracking-wide">
                    Provisioning… <ChevronRight className="h-3 w-3" />
                  </span>
                  <span className="truncate max-w-[260px] opacity-70 text-[10px]">
                    Complete KYC to activate your unique VFD account
                  </span>
                </button>
              );
            }
            return (
              <button
                onClick={copyAccount}
                className="flex flex-col items-start gap-0.5 text-xs opacity-80 hover:opacity-100 transition-opacity mb-4 text-left"
              >
                <span className="text-[10px] uppercase tracking-wider opacity-60">
                  Your VFD account number
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold tracking-wide">{acct}</span>
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </span>
                <span className="truncate max-w-[220px] opacity-60">{displayAccountName}</span>
              </button>
            );
          })()}



          {/* Secondary detail row — clearly subordinate to Total */}
          <div className="grid grid-cols-3 gap-2 border-t border-primary-foreground/15 pt-3">
            {[
              { label: "Available", value: balance.availableBalance },
              { label: "Locked", value: balance.lockedBalance },
              { label: "Savings", value: balance.savingsBalance },
            ].map((item) => (
              <div key={item.label} className="min-w-0">
                <p className="text-xs opacity-75">{item.label}</p>
                <p className="text-sm font-semibold tabular-nums break-words">
                  {showBalance ? `₦${item.value.toLocaleString()}` : "••••"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ═══ KYC TIER PILL ═══ */}
      {(() => {
        const tierKey = (tier || "tier1").toLowerCase();
        const info = TIER_INFO[tierKey] || TIER_INFO.tier1;
        const canUpgrade = tierKey !== "tier3" && !upgradePending;
        return (
          <div className="flex items-center gap-2 -mt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft text-accent-foreground px-3 py-1 text-xs font-semibold">
              <Shield className="h-3.5 w-3.5" />
              {upgradePending ? "Upgrade in progress · up to 24h" : `${info.short} · ${info.daily} daily limit`}
            </span>
            {canUpgrade && (
              <button onClick={() => onNavigate("kyc")} className="min-h-0 text-xs font-semibold text-primary flex items-center gap-0.5 active:opacity-60">
                Upgrade <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })()}

      {/* ═══ QUICK ACTIONS ROW ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-5 gap-2"
      >
        {[
          { key: "fund", label: "Add Money", icon: Plus, color: "bg-primary-soft text-primary", tap: { rotate: [0, 90] } },
          { key: "withdraw", label: "Withdraw", icon: Banknote, color: "bg-primary-soft text-primary", tap: { y: [0, -3, 0], rotate: [0, 8, 0] } },
          { key: "services", label: "Services", icon: LayoutGrid, color: "bg-primary-soft text-primary", tap: { x: [0, 3, 0], y: [0, -3, 0] } },
          { key: "lock", label: "Lock", icon: Lock, color: "bg-primary-soft text-primary", tap: { y: [0, 2, 0], scale: [1, 0.92, 1] } },
          { key: "history", label: "History", icon: Clock, color: "bg-primary-soft text-primary", tap: { rotate: [0, 90, 90] } },
        ].map((action) => (
          <button
            key={action.key}
            onClick={() => {
              void haptic("light");
              setTapped({ key: action.key, n: Date.now() });
              if (action.key === "services") {
                document.getElementById("home-services")?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
              }
              // Let the icon cue play briefly; never block input.
              setTimeout(() => onNavigate(action.key), 160);
            }}
            className="flex flex-col items-center gap-2 group"
          >
            <motion.div
              whileTap={press}
              transition={spring}
              className={`w-14 h-14 rounded-2xl ${action.color} flex items-center justify-center`}
            >
              <motion.span
                key={tapped?.key === action.key ? tapped.n : 0}
                initial={false}
                animate={tapped?.key === action.key ? action.tap : undefined}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="inline-flex"
              >
                <action.icon className="h-5 w-5" />
              </motion.span>
            </motion.div>
            <span className="text-xs font-medium text-foreground">{action.label}</span>
          </button>
        ))}
      </motion.div>

      {/* ═══ THIS WEEK (SPENDLOCK) ═══ */}
      <div id="home-spendlock" className="space-y-3 scroll-mt-20">
        <SpendLockCard />
      </div>

      {/* ═══ RECENT ACTIVITY ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground">Recent Activity</h3>
          <button
            onClick={() => onNavigate("history")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            View all
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/50 p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No transactions yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1 mb-3">Start saving today to see your activity here</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigate("fund")}
              className="text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Fund Account
            </Button>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm divide-y divide-border overflow-hidden">
            {recentTransactions.slice(0, 5).map((tx, i) => {
              const meta = getTxMeta(tx.transaction_type);
              const TxIcon = meta.icon;
              const info = describeTransaction(tx);
              const isCredit = tx.transaction_type === "credit" || tx.transaction_type === "unlock" || tx.transaction_type === "interest";
              const displayLabel = info.title;
              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.04 }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
                    <TxIcon className={`h-4 w-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {displayLabel}
                    </p>
                    {info.subtitle && (
                      <p className="text-[10px] text-muted-foreground truncate">{info.subtitle}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString("en-NG", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${isCredit ? "text-success" : "text-foreground"}`}>
                    {meta.sign}₦{tx.amount.toLocaleString()}
                  </p>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* ═══ SCROLLING PRODUCT BANNERS ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Start a new savings plan</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Existing holdings live in Active Savings
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10" disabled={activeBanner === 0} onClick={() => { setCarouselPaused(true); moveBanner(activeBanner - 1); }} aria-label="Previous savings plan">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10" disabled={activeBanner === productBanners.length - 1} onClick={() => { setCarouselPaused(true); moveBanner(activeBanner + 1); }} aria-label="Next savings plan">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          ref={bannerRef}
          className="flex touch-pan-x gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-1 scrollbar-hide pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          onPointerDown={() => setCarouselPaused(true)}
          onTouchStart={() => setCarouselPaused(true)}
          onScroll={(e) => {
            const el = e.currentTarget;
            const cards = Array.from(el.children) as HTMLElement[];
            const idx = cards.reduce((closest, card, index) =>
              Math.abs(card.offsetLeft - el.scrollLeft) < Math.abs(cards[closest].offsetLeft - el.scrollLeft) ? index : closest, 0);
            if (idx !== activeBanner && idx >= 0 && idx < productBanners.length) {
              setActiveBanner(idx);
            }
          }}
        >
          {productBanners.map((banner) => {
            const holding = holdings[banner.key];
            return (
              <button
                key={banner.key}
                onClick={() => onNavigate(banner.routeKey)}
                className={`flex-none w-[80%] min-w-[260px] snap-center rounded-2xl bg-gradient-to-br ${banner.gradient} p-4 shadow-sm text-left text-ink-foreground relative overflow-hidden active:scale-[0.99] transition-transform`}
              >
                <div className={`absolute top-3 right-3 w-14 h-14 rounded-2xl ${banner.accent} flex items-center justify-center`}>
                  <banner.icon className="h-7 w-7 opacity-90" />
                </div>
                <div className="relative z-10 min-h-[118px] flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-semibold mb-1 tracking-tight">{banner.title}</h4>
                    <p className="text-xs opacity-90 max-w-[80%] leading-relaxed">{banner.subtitle}</p>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <span className="inline-block text-[11px] font-semibold bg-ink/25 px-3 py-1.5 rounded-full">
                      {banner.cta}
                    </span>
                    <span className="text-[11px] font-semibold opacity-100 tabular-nums">

                      {holding && showBalance
                        ? `₦${holding.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                        : holding && !showBalance
                        ? "••••"
                        : "₦0"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

      </motion.div>

      {/* ═══ SERVICES (grouped categories) ═══ */}
      <motion.div
        id="home-services"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="scroll-mt-20"
      >
        <h3 className="text-sm font-bold text-foreground mb-3">Services</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {serviceCategories.map((cat) => {
            const dimmed = !!cat.comingSoon;
            const isOpen = openCategory === cat.key;
            return (
              <motion.button
                key={cat.key}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (cat.navKey) return onNavigate(cat.navKey);
                  setOpenCategory(isOpen ? null : cat.key);
                }}
                aria-expanded={cat.children ? isOpen : undefined}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border transition-all ${
                  isOpen ? "border-primary/40 shadow-sm" : "border-border/60 hover:border-primary/30"
                } ${dimmed ? "opacity-70" : ""}`}
              >
                {dimmed && (
                  <span className="absolute top-1 right-1 text-[8px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                    Soon
                  </span>
                )}
                <div className={`w-11 h-11 rounded-xl ${cat.color} flex items-center justify-center`}>
                  <cat.icon className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-foreground leading-tight">{cat.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{cat.desc}</p>
                </div>
                {cat.children && (
                  <ChevronRight
                    className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Second level — revealed for the open category only */}
        <AnimatePresence initial={false}>
          {openCategory && (
            <motion.div
              key={openCategory}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2.5 rounded-2xl border border-border/60 bg-card divide-y divide-border/50">
                {(serviceCategories.find((c) => c.key === openCategory)?.children || []).map((child) => {
                  const disabled = !!child.comingSoon;
                  return (
                    <button
                      key={child.key}
                      onClick={() => { if (!disabled) onNavigate(child.key); }}
                      disabled={disabled}
                      aria-disabled={disabled}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
                        <child.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground leading-tight">{child.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{child.desc}</p>
                      </div>
                      {disabled ? (
                        <span className="text-[9px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                          Soon
                        </span>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>


    </div>
  );
}
