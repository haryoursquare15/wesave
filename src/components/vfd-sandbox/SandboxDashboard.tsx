import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Wallet, Lock, Users, Target, Heart, Receipt, Send,
  CreditCard, Eye, EyeOff, TrendingUp, Plus, ArrowDownLeft, ArrowUpRight,
  Shield, ChevronRight, ChevronLeft, PiggyBank,
  Clock, Copy, Check, Building2, Vault as VaultIcon, Zap, Gift, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import vestaraBadge from "@/assets/vestara-badge.jpg";
import { describeTransaction } from "@/lib/transactionLabels";
import { supabase } from "@/integrations/supabase/client";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";

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
}

const TIER_INFO: Record<string, { label: string; daily: string; color: string }> = {
  tier1: { label: "Tier 1 — Starter", daily: "₦30,000 daily", color: "bg-blue-500/25 text-blue-50 border-blue-300/50" },
  tier2: { label: "Tier 2 — Standard", daily: "₦100,000 daily", color: "bg-amber-500/25 text-amber-50 border-amber-300/50" },
  tier3: { label: "Tier 3 — Premium", daily: "₦5,000,000 daily", color: "bg-emerald-500/25 text-emerald-50 border-emerald-300/50" },
};

/* ─── Animated Counter ─── */
function AnimatedNumber({ value, prefix = "₦" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 700;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
      else prevRef.current = value;
    };
    requestAnimationFrame(animate);
  }, [value]);

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
    gradient: "from-amber-500 to-orange-600",
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
    color: "bg-cyan-500/10 text-cyan-600",
    desc: "Airtime, utilities, split",
    children: [
      { key: "bills", label: "Pay Bills", icon: CreditCard, desc: "Airtime, data & utilities" },
      { key: "split", label: "Split Bills", icon: Receipt, desc: "Share costs with others" },
      { key: "card", label: "Virtual Card", icon: CreditCard, desc: "Coming soon", comingSoon: true },
    ],
  },
  {
    key: "transfer",
    label: "Transfer",
    icon: Send,
    color: "bg-purple-500/10 text-purple-600",
    desc: "Send money",
    navKey: "transfer",
  },
  {
    key: "save-invest",
    label: "Save & Invest",
    icon: PiggyBank,
    color: "bg-emerald-500/10 text-emerald-600",
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
    color: "bg-orange-500/10 text-orange-600",
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
export function SandboxDashboard({ balance, onNavigate, recentTransactions = [], tier, upgradePending = false }: SandboxDashboardProps) {
  const [showBalance, setShowBalance] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeBanner, setActiveBanner] = useState(0);
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


  // Auto-scroll banners
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveBanner((prev) => (prev + 1) % productBanners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Scroll banner into view
  useEffect(() => {
    if (bannerRef.current) {
      const card = bannerRef.current.children[activeBanner] as HTMLElement;
      if (card) {
        card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [activeBanner]);

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
        <img
          src={vestaraBadge}
          alt="Vestara"
          className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/20 shadow-md shrink-0"
        />
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
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-5 text-primary-foreground shadow-xl"
      >
        {/* Decorative circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/[0.06]" />
          <div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-white/[0.04]" />
          <div className="absolute right-1/4 top-1/2 h-20 w-20 rounded-full bg-white/[0.03]" />
        </div>

        <div className="relative z-10">
          {/* Top row */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 opacity-70" />
              <span className="text-xs font-medium opacity-70 tracking-wide uppercase">Total Balance</span>
            </div>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
              aria-label={showBalance ? "Hide balance" : "Show balance"}
            >
              {showBalance ? <Eye className="h-4 w-4 opacity-70" /> : <EyeOff className="h-4 w-4 opacity-70" />}
            </button>
          </div>

          {/* Primary figure — Total */}
          <AnimatePresence mode="wait">
            <motion.h2
              key={showBalance ? "shown" : "hidden"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-[2.5rem] font-extrabold tracking-tight mb-1 leading-none"
            >
              {showBalance ? <AnimatedNumber value={balance.totalBalance} /> : "₦ ••••••"}
            </motion.h2>
          </AnimatePresence>

          {/* Secondary detail — Available, Locked, Savings */}
          <p className="text-[11px] opacity-70 mb-2 leading-snug">
            Available{" "}
            <span className="font-semibold opacity-100">
              {showBalance ? `₦${balance.availableBalance.toLocaleString()}` : "••••"}
            </span>
          </p>


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
                    <Check className="h-3 w-3 text-green-300" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </span>
                <span className="truncate max-w-[220px] opacity-60">{displayAccountName}</span>
              </button>
            );
          })()}



          {/* Secondary detail row — clearly subordinate to Total */}
          <div className="flex items-center gap-4 border-t border-white/[0.12] pt-2.5">
            {[
              { label: "Locked", value: balance.lockedBalance, icon: Lock },
              { label: "Savings", value: balance.savingsBalance, icon: PiggyBank },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <item.icon className="h-3 w-3 opacity-40" />
                <span className="text-[10px] opacity-55">{item.label}</span>
                <span className="text-[11px] font-semibold opacity-90">
                  {showBalance ? `₦${item.value.toLocaleString()}` : "••••"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ═══ KYC TIER BANNER ═══ */}
      {(() => {
        const tierKey = (tier || "tier1").toLowerCase();
        const info = TIER_INFO[tierKey] || TIER_INFO.tier1;
        const canUpgrade = tierKey !== "tier3" && !upgradePending;
        return (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            onClick={() => canUpgrade && onNavigate("kyc")}
            disabled={!canUpgrade}
            className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left ${info.color} ${canUpgrade ? "active:scale-[0.99] hover:opacity-90" : "cursor-default"}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Shield className="h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-[13px] font-extrabold tracking-tight leading-tight truncate">
                  {upgradePending ? "Upgrade in progress" : info.label}
                </p>
                <p className="text-[11px] font-semibold opacity-95 leading-tight">
                  {upgradePending ? "Takes no more than 24 hours" : `Limit: ${info.daily}`}
                </p>
              </div>
            </div>
            {canUpgrade && (
              <span className="text-[10px] font-semibold whitespace-nowrap flex items-center gap-1">
                Upgrade <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </motion.button>
        );
      })()}

      {/* ═══ QUICK ACTIONS ROW ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-4 gap-3"
      >
        {[
          { key: "fund", label: "Add Money", icon: Plus, color: "bg-green-500 text-white" },
          { key: "transfer", label: "Transfer", icon: Send, color: "bg-blue-500 text-white" },
          { key: "lock", label: "Lock", icon: Lock, color: "bg-amber-500 text-white" },
          { key: "history", label: "History", icon: Clock, color: "bg-gray-500 text-white" },
        ].map((action) => (
          <button
            key={action.key}
            onClick={() => onNavigate(action.key)}
            className="flex flex-col items-center gap-2 group"
          >
            <motion.div
              whileTap={{ scale: 0.9 }}
              className={`w-14 h-14 rounded-2xl ${action.color} flex items-center justify-center shadow-md transition-shadow group-hover:shadow-lg`}
            >
              <action.icon className="h-5 w-5" />
            </motion.div>
            <span className="text-[11px] font-semibold text-muted-foreground">{action.label}</span>
          </button>
        ))}
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
        </div>

        <div
          ref={bannerRef}
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const cardWidth = el.children[0]?.clientWidth || 260;
            const idx = Math.round(el.scrollLeft / (cardWidth + 12));
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
                className={`flex-none w-[80%] min-w-[260px] snap-center rounded-2xl bg-gradient-to-br ${banner.gradient} p-5 text-left relative overflow-hidden active:scale-[0.99] transition-transform`}
              >
                <div className={`absolute top-3 right-3 w-16 h-16 rounded-2xl ${banner.accent} flex items-center justify-center`}>
                  <banner.icon className="h-8 w-8 text-white/80" />
                </div>
                <div className="relative z-10 min-h-[132px] flex flex-col justify-between">
                  <div>
                    <h4 className="text-base font-bold text-white mb-1">{banner.title}</h4>
                    <p className="text-xs text-white/80 max-w-[75%] leading-relaxed">{banner.subtitle}</p>
                  </div>

                  <div className="flex items-end justify-between">
                    <span className="inline-block text-xs font-semibold text-white bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-sm">
                      {banner.cta}
                    </span>
                    <span className="text-[11px] font-semibold text-white/90 tabular-nums">
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
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
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
                      <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        <child.icon className="h-4 w-4 text-muted-foreground" />
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


      {/* ═══ TRUST BANNER ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-3 rounded-2xl bg-success/5 border border-success/15 px-4 py-3"
      >
        <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
          <Shield className="h-5 w-5 text-success" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-success">Your funds are secure</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Powered by VFD MicroFinance Bank • NDIC Insured</p>
        </div>
      </motion.div>

      {/* ═══ RECENT ACTIVITY ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
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
          <div className="bg-card rounded-2xl border border-border/50 divide-y divide-border/30 overflow-hidden">
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
                  transition={{ delay: 0.35 + i * 0.04 }}
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
    </div>
  );
}
