import { motion, AnimatePresence , useReducedMotion} from "framer-motion";
import { haptic } from "@/lib/haptics";
import { press, spring } from "@/lib/motion";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Wallet, Lock, Users, Target, Heart, Receipt, Send, LayoutGrid,
  CreditCard, Eye, EyeOff, TrendingUp, Plus, ArrowDownLeft, ArrowUpRight, ArrowRight, Banknote,
  Shield, ChevronRight, ChevronLeft, PiggyBank,
  Clock, Copy, Check, Building2, Vault as VaultIcon, Zap, Gift, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import vestaraBadge from "@/assets/vestara-mark.png";

// Editorial photography is used only for optional navigation surfaces.
const serviceImagery = {
  split: "https://images.pexels.com/photos/30678206/pexels-photo-30678206.jpeg?auto=compress&cs=tinysrgb&w=900",
  save: "https://images.pexels.com/photos/30677594/pexels-photo-30677594.jpeg?auto=compress&cs=tinysrgb&w=950",
  ajo: "https://images.pexels.com/photos/17272256/pexels-photo-17272256.jpeg?auto=compress&cs=tinysrgb&w=900",
};
import { describeTransaction } from "@/lib/transactionLabels";
import { cleanCustomerName, customerFirstName } from "@/lib/customerName";
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
export function SandboxDashboard({ balance, onNavigate, recentTransactions = [], tier, upgradePending = false }: SandboxDashboardProps) {
  const [showBalance, setShowBalance] = useState(true);

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
    const first = customerFirstName(balance.fullName, "");
    return first || "there";
  })();

  // Interim cosmetic mask: VFD registers sub-accounts as "<Corporate>-<NAME>".
  // Until VFD updates the merchant name, hide the legacy corporate prefix.
  const displayAccountName = cleanCustomerName(balance.fullName?.trim()) || balance.fullName || "—";
  // Allocation uses actual account balances, never fabricated performance data.
  const allocations = [
    { label: "Available", amount: Math.max(0, balance.availableBalance), tone: "available" },
    { label: "Savings", amount: Math.max(0, balance.savingsBalance), tone: "savings" },
    { label: "Locked", amount: Math.max(0, balance.lockedBalance), tone: "locked" },
  ];
  const allocationTotal = allocations.reduce((total, segment) => total + segment.amount, 0);
  const money = (amount: number) => "₦" + amount.toLocaleString("en-NG", { maximumFractionDigits: 2 });


  return (
    <div className="vm-dashboard">
      <header className="vm-welcome">
        <div>
          <h1>{greeting}, <span>{firstName}.</span></h1>
          <p>Everything that matters, in one considered place.</p>
        </div>
      </header>

      <div className="vm-overview-grid">
        <section className="vm-balance-stage" aria-label="Your money overview">
          <div className="vm-stage-top"><span>YOUR MONEY</span><span className="vm-stage-chip"><span /> ACCOUNT OVERVIEW</span></div>
          <div className="vm-balance-block">
            <div className="vm-balance-label">
              <span>Total balance</span>
              <button type="button" onClick={() => setShowBalance(!showBalance)} aria-label={showBalance ? "Hide balance" : "Show balance"}>
                {showBalance ? <Eye size={19} /> : <EyeOff size={19} />}
                {showBalance ? "Hide" : "Show"}
              </button>
            </div>
            <h2 aria-live="polite">{showBalance ? <AnimatedNumber value={balance.totalBalance} /> : "₦ ••••••"}</h2>
            {balance.noVfdAccount && <p className="vm-inline-notice">Finish account verification to receive your account number.</p>}
            {!balance.noVfdAccount && balance.stale && <p className="vm-inline-notice">Showing your last known balance. Refresh to see recent changes.</p>}
          </div>
          <div className="vm-money-composition">
            {[
              { name: "Available", sum: balance.availableBalance },
              { name: "Saved", sum: balance.savingsBalance },
              { name: "Locked", sum: balance.lockedBalance },
            ].map((item) => (
              <div key={item.name}>
                <span>{item.name}</span>
                <strong>{showBalance ? "₦" + item.sum.toLocaleString("en-NG") : "••••"}</strong>
              </div>
            ))}
          </div>
          <div className="vm-balance-footer">
            <button className="vm-button vm-button-dark" onClick={() => onNavigate("fund")} type="button">Add money <Plus size={18} /></button>
            <button className="vm-button vm-button-ghost" onClick={() => onNavigate("transfer")} type="button">Send money <ArrowUpRight size={18} /></button>
          </div>
        </section>
        <aside className="vm-account-pass" aria-label="Account details">
          <div className="vm-pass-top"><span>VESTARA <b>BANKING</b></span><CreditCard size={21} strokeWidth={1.5} /></div>
          <div className="vm-pass-content">
            <p>YOUR BANKING DETAILS</p>
            <span>VFD account number</span>
            {balance.accountNumber && balance.accountNumber !== "—" && balance.accountNumber !== "1001695610" ? (
              <button type="button" className="vm-pass-account" onClick={copyAccount} aria-label="Copy account number">
                {balance.accountNumber} {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            ) : (
              <button type="button" className="vm-pass-account" onClick={() => onNavigate("kyc")}>Activate account <ArrowUpRight size={17} /></button>
            )}
            <strong className="vm-pass-name">{displayAccountName}</strong>
          </div>
          <div className="vm-pass-footer">
            <div><ShieldCheck size={17} /><span>{upgradePending ? "Upgrade pending" : (TIER_INFO[(tier || "tier1").toLowerCase()] || TIER_INFO.tier1).short + " account"}</span></div>
            {(tier || "tier1").toLowerCase() !== "tier3" && !upgradePending && <button type="button" onClick={() => onNavigate("kyc")}>Upgrade <ArrowUpRight size={15} /></button>}
          </div>
        </aside>
      </div>

      <section className="vv-allocation" aria-label="Balance allocation">
        <div className="vv-allocation-heading">
          <div>
            <span className="vv-overline">BALANCE BREAKDOWN</span>
            <h2>Where it all sits<span>.</span></h2>
            <p>A simple view of your available, saved and locked balances.</p>
          </div>
          <button type="button" onClick={() => onNavigate("insights")}>Explore insights <ArrowUpRight size={17} /></button>
        </div>
        <div className="vv-allocation-bar" role="img" aria-label={allocationTotal > 0 ? allocations.map(a => `${a.label}: ${Math.round(a.amount / allocationTotal * 100)} percent`).join(", ") : "No balances to display yet"}>
          {allocationTotal > 0 ? allocations.filter(a => a.amount > 0).map(a => (
            <span key={a.tone} className={`vv-allocation-part vv-allocation-${a.tone}`} style={{ width: `${a.amount / allocationTotal * 100}%` }} />
          )) : <span className="vv-allocation-empty" />}
        </div>
        <div className="vv-allocation-legend">
          {allocations.map((a) => (
            <div key={a.tone}>
              <span className={`vv-allocation-dot vv-allocation-${a.tone}`} />
              <div><small>{a.label}</small><strong>{showBalance ? money(a.amount) : "••••••"}</strong></div>
              <span className="vv-allocation-percent">{allocationTotal > 0 && showBalance ? `${Math.round(a.amount / allocationTotal * 100)}%` : "—"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="vm-section vm-actions-section" aria-labelledby="vm-actions-title">
        <div className="vm-section-top"><div><span className="vm-kicker">EVERYDAY BANKING</span><h2 id="vm-actions-title">Everyday, simplified.</h2></div></div>
        <div className="vm-action-grid">
          {[
            { label: "Add money", desc: "Fund your account", icon: ArrowDownLeft, go: "fund" },
            { label: "Transfer", desc: "Send securely", icon: ArrowUpRight, go: "transfer" },
            { label: "Withdraw", desc: "Access your money", icon: Banknote, go: "withdraw" },
            { label: "Pay bills", desc: "Everyday essentials", icon: Receipt, go: "bills" },
            { label: "Savings", desc: "Build tomorrow", icon: PiggyBank, go: "lock" },
            { label: "Statements", desc: "See your activity", icon: Clock, go: "history" },
          ].map((action) => (
            <button className="vm-action-item" key={action.label} type="button" onClick={() => { void haptic("light"); onNavigate(action.go); }}>
              <span className="vm-action-icon"><action.icon size={22} strokeWidth={1.65} /></span>
              <span className="vm-action-copy"><strong>{action.label}</strong><small>{action.desc}</small></span>
              <ArrowUpRight className="vm-action-arrow" size={17} />
            </button>
          ))}
        </div>
      </section>

      <div className="vm-lower-grid">
        <section className="vm-activity vm-section" aria-labelledby="vm-activity-title">
          <div className="vm-section-top"><div><span className="vm-kicker">MONEY IN MOTION</span><h2 id="vm-activity-title">Recent activity</h2></div><button type="button" className="vm-text-link" onClick={() => onNavigate("history")}>View all <ArrowUpRight size={17} /></button></div>
          <div className="vm-activity-list">
            {recentTransactions.length === 0 ? (
              <div className="vm-empty-activity"><span><Clock size={25} /></span><strong>A fresh start.</strong><p>Your transactions will appear here as they happen.</p><button type="button" onClick={() => onNavigate("fund")}>Add your first deposit <ArrowRight size={15} /></button></div>
            ) : recentTransactions.slice(0, 5).map((tx) => {
              const meta = getTxMeta(tx.transaction_type);
              const TxIcon = meta.icon;
              const info = describeTransaction(tx);
              const isCredit = ["credit", "unlock", "interest"].includes(tx.transaction_type);
              return (
                <div className="vm-activity-row" key={tx.id}>
                  <span className={"vm-transaction-icon " + (isCredit ? "vm-credit" : "vm-debit")}><TxIcon size={19} strokeWidth={1.75} /></span>
                  <div className="vm-activity-copy"><strong>{info.title}</strong><span>{new Date(tx.created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })}</span></div>
                  <strong className={"vm-activity-amount " + (isCredit ? "vm-positive" : "")}>{meta.sign}₦{Number(tx.amount || 0).toLocaleString("en-NG")}</strong>
                </div>
              );
            })}
          </div>
        </section>
        <aside className="vm-savings-feature">
          <span className="vm-kicker">GROW WITH VESTARA</span>
          <div className="vm-saving-symbol"><PiggyBank size={32} strokeWidth={1.35} /></div>
          <h2>Good things<br />take intention.</h2>
          <p>Put a little aside today for the life you're building.</p>
          <div className="vm-savings-feature-footer">
            <div><span>IN YOUR SAVINGS</span><strong>{showBalance ? "₦" + balance.savingsBalance.toLocaleString("en-NG") : "••••"}</strong></div>
            <button type="button" onClick={() => onNavigate("lock")} aria-label="Explore savings"><ArrowUpRight size={23} /></button>
          </div>
        </aside>
      </div>

      <section className="vm-section vm-services" id="home-services">
        <div className="vm-section-top"><div><span className="vm-kicker">MORE POSSIBILITIES</span><h2>Banking that goes further.</h2></div></div>
        <div className="vm-service-grid">
          {serviceCategories.map((category) => {
            const Icon = category.icon;
            const expanded = openCategory === category.key;
            return (
              <article className={"vm-service-tile " + (expanded ? "vm-service-open" : "")} key={category.key}>
                <button type="button" aria-expanded={Boolean(category.children) ? expanded : undefined} onClick={() => {
                  if (category.navKey) { onNavigate(category.navKey); return; }
                  setOpenCategory(expanded ? null : category.key);
                }}>
                  <Icon size={31} strokeWidth={1.35} />
                  <strong>{category.label}</strong>
                  <small>{category.desc}</small>
                  <span className="vm-service-arrow"><ArrowUpRight size={20} /></span>
                </button>
                {expanded && category.children && (
                  <div className="vm-service-children">
                    {category.children.map((child) => (
                      <button type="button" key={child.key} disabled={Boolean(child.comingSoon)} onClick={() => onNavigate(child.key)}>
                        <span>{child.label}{child.comingSoon && <small> · Coming soon</small>}</span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="vm-section vm-products">
        <div className="vm-section-top"><div><span className="vm-kicker">SAVINGS & FUTURE PLANS</span><h2>For everything ahead.</h2></div><button className="vm-text-link" type="button" onClick={() => onNavigate("lock")}>All plans <ArrowUpRight size={17} /></button></div>
        <div className="vm-product-grid">
          {productBanners.map((product, index) => {
            const Icon = product.icon;
            const holding = holdings[product.key];
            return (
              <button className={"vm-product-card vm-product-" + index} type="button" key={product.key} onClick={() => onNavigate(product.routeKey)}>
                <span className="vm-product-meta"><span>SAVINGS PLAN</span><Icon size={20} strokeWidth={1.6} /></span>
                <strong>{product.title}</strong>
                <small>{product.subtitle}</small>
                <span className="vm-product-bottom"><span>{holding ? showBalance ? "₦" + holding.total.toLocaleString("en-NG", { maximumFractionDigits: 2 }) + " invested" : "•••• invested" : "Explore plan"}</span><ArrowUpRight size={19} /></span>
              </button>
            );
          })}
        </div>
      </section>
      <div className="vm-spendlock"><SpendLockCard /></div>
    </div>
  );
}
