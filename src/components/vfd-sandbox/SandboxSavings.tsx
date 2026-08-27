import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, Unlock, TrendingUp, ArrowLeft, RefreshCw,
  Percent, ArrowRight, AlertTriangle, Sparkles, Target, Vault as VaultIcon, Zap, Gift,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useVestaraLedger, VestaraProduct, VestaraSavings as VS, VestaraProductCode,
} from "@/hooks/useVestaraLedger";
import { TransactionPinGate } from "@/components/security/TransactionPinGate";
import { TransactionSuccessModal, TransactionSuccessPayload } from "@/components/feedback/TransactionSuccessModal";
import { GoalSavingsV2Wizard } from "./GoalSavingsV2Wizard";
import { SavingsPlanCard, planState, PlanState } from "./SavingsPlanCard";
import { useMandates } from "@/hooks/useMandates";

interface UserBalance {
  total_balance: number; locked_balance: number; savings_balance: number; available_balance: number;
}

interface Props {
  userBalance: UserBalance | null;
  onRefresh: () => void;
  onBack: () => void;
  initialProductCode?: string | null;
}

type FlowStep = "product" | "amount" | "tenor" | "confirm";

const PRODUCT_ICONS: Record<VestaraProductCode, React.ComponentType<{ className?: string }>> = {
  goalsave: Target,
  vault: VaultIcon,
  lockmax: Zap,
  upfront_yield: Gift,
};

const PRODUCT_GRADIENTS: Record<VestaraProductCode, string> = {
  goalsave: "from-blue-500/10 to-cyan-500/5 border-blue-500/20",
  vault: "from-emerald-500/10 to-green-500/5 border-emerald-500/20",
  lockmax: "from-purple-500/10 to-fuchsia-500/5 border-purple-500/20",
  upfront_yield: "from-amber-500/10 to-orange-500/5 border-amber-500/20",
};

export function SandboxSavings({ userBalance, onRefresh, onBack, initialProductCode }: Props) {
  const { toast } = useToast();
  const vestara = useVestaraLedger();
  const { findFor: findMandate } = useMandates();

  const [products, setProducts] = useState<VestaraProduct[]>([]);
  const [savings, setSavings] = useState<VS[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [showGoalV2, setShowGoalV2] = useState(false);
  const [step, setStep] = useState<FlowStep>("product");
  const [selectedProduct, setSelectedProduct] = useState<VestaraProduct | null>(null);
  const [amount, setAmount] = useState("");
  const [tenor, setTenor] = useState<number | null>(null);

  // PIN gate + success modal state
  const [pinGate, setPinGate] = useState<null | { purpose: string; description: string; onAuthorized: () => void }>(null);
  const [successPayload, setSuccessPayload] = useState<TransactionSuccessPayload | null>(null);

  const availableBalance = Number(userBalance?.available_balance || 0);

  // Product filter for the plan list ("all" or a product code)
  const [planFilter, setPlanFilter] = useState<string>("all");

  const loadAll = async () => {
    setLoadingData(true);
    const [p, s] = await Promise.all([vestara.listProducts(), vestara.listSavings()]);
    setProducts(p);
    setSavings(s);
    setLoadingData(false);
  };

  useEffect(() => {
    loadAll();
    onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-jump straight into the chosen product's form when arriving from a
  // product banner (e.g. "GoalSave", "Vault", "LockMax", "Upfront Yield").
  const autoOpenedRef = useState<{ done: boolean }>({ done: false })[0];
  useEffect(() => {
    if (!initialProductCode || loadingData || autoOpenedRef.done) return;
    if (initialProductCode === "goalsave") {
      autoOpenedRef.done = true;
      setShowGoalV2(true);
      return;
    }
    const p = products.find((x) => x.code === initialProductCode);
    if (p) {
      autoOpenedRef.done = true;
      setSelectedProduct(p);
      setShowCreate(true);
      setStep("amount");
    }
  }, [initialProductCode, loadingData, products, autoOpenedRef]);

  /* ─── Tenor presets per product ─── */
  const tenorPresets = useMemo(() => {
    if (!selectedProduct) return [];
    const min = selectedProduct.min_tenor_days;
    const max = selectedProduct.max_tenor_days;
    const candidates = [30, 60, 90, 180, 270, 365];
    const filtered = candidates.filter(d => d >= min && d <= max);
    if (!filtered.includes(min)) filtered.unshift(min);
    if (!filtered.includes(max)) filtered.push(max);
    return Array.from(new Set(filtered)).sort((a, b) => a - b);
  }, [selectedProduct]);

  /* ─── Tenor → user_rate (linear scale within product range) ─── */
  const computeUserRate = (p: VestaraProduct, days: number) => {
    const span = p.max_tenor_days - p.min_tenor_days;
    if (span <= 0) return p.max_user_rate;
    const t = (days - p.min_tenor_days) / span;
    return p.min_user_rate + t * (p.max_user_rate - p.min_user_rate);
  };

  /* ─── Preview ─── */
  const amtNum = parseFloat(amount);
  const exceedsAvailable = !isNaN(amtNum) && amtNum > availableBalance;

  const preview = useMemo(() => {
    if (!selectedProduct || !tenor || isNaN(amtNum) || amtNum <= 0) return null;
    const rate = computeUserRate(selectedProduct, tenor);
    const time = tenor / 365;
    const r = rate / 100;

    if (selectedProduct.is_upfront_yield) {
      const discounted = (amtNum * r * time) / (1 + r * time);
      const maturity = new Date();
      maturity.setDate(maturity.getDate() + tenor);
      return {
        rate,
        upfront: true,
        discountedInterest: Math.round(discounted * 100) / 100,
        netDebit: Math.round((amtNum - discounted) * 100) / 100,
        principal: amtNum,
        maturityDate: maturity,
      };
    }

    const interest = amtNum * r * time;
    const maturity = new Date();
    maturity.setDate(maturity.getDate() + tenor);
    return {
      rate,
      upfront: false,
      interest: Math.round(interest * 100) / 100,
      total: Math.round((amtNum + interest) * 100) / 100,
      principal: amtNum,
      maturityDate: maturity,
    };
  }, [selectedProduct, tenor, amtNum]);

  /* ─── Actions ─── */
  const resetFlow = () => {
    setShowCreate(false);
    setStep("product");
    setSelectedProduct(null);
    setAmount("");
    setTenor(null);
  };

  const handleConfirm = () => {
    if (!selectedProduct || !tenor || isNaN(amtNum)) return;
    if (amtNum > availableBalance) {
      toast({
        title: "Insufficient available balance",
        description: `You only have ₦${availableBalance.toLocaleString()} available.`,
        variant: "destructive",
      });
      return;
    }
    setPinGate({
      purpose: `Create ${selectedProduct.name}`,
      description: `Lock ₦${amtNum.toLocaleString()} for ${tenor} days`,
      onAuthorized: async () => {
        const productName = selectedProduct.name;
        const productTenor = tenor;
        const productAmount = amtNum;
        const previewSnapshot = preview;
        const result = await vestara.createSavings(selectedProduct.code, amtNum, tenor);
        if (result && !result.error) {
          const details: { label: string; value: string; highlight?: boolean }[] = [
            { label: "Product", value: productName, highlight: true },
            { label: "Principal", value: `₦${productAmount.toLocaleString()}`, highlight: true },
            { label: "Tenor", value: `${productTenor} days` },
          ];
          if (previewSnapshot) {
            details.push({ label: "Rate", value: `${previewSnapshot.rate.toFixed(2)}% p.a.` });
            if (previewSnapshot.upfront) {
              details.push({ label: "Upfront Interest", value: `+₦${(previewSnapshot.discountedInterest ?? 0).toLocaleString()}` });
              details.push({ label: "Net Wallet Debit", value: `₦${(previewSnapshot.netDebit ?? 0).toLocaleString()}`, highlight: true });
            } else {
              details.push({ label: "Interest at Maturity", value: `+₦${(previewSnapshot.interest ?? 0).toLocaleString()}` });
              details.push({ label: "Total at Maturity", value: `₦${(previewSnapshot.total ?? 0).toLocaleString()}`, highlight: true });
            }
            details.push({
              label: "Matures On",
              value: previewSnapshot.maturityDate.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" }),
            });
          }
          setSuccessPayload({
            title: "Submitted for Review",
            description: `Your ${productName} investment is awaiting admin approval. Funds are safely on hold and will be locked in once approved.`,
            details,
            reference: (result as { savings_id?: string })?.savings_id,
          });
          resetFlow();
          await loadAll();
          onRefresh();
        }
      },
    });
  };

  const handleMature = (s: VS) => {
    setPinGate({
      purpose: "Mature savings",
      description: `Withdraw ₦${Number(s.principal).toLocaleString()} + interest to wallet`,
      onAuthorized: async () => {
        const result = await vestara.matureSavings(s.id);
        if (result && !result.error) {
          const interest = Number(s.accrued_interest || 0);
          const total = Number(s.principal) + interest;
          setSuccessPayload({
            title: "Savings Matured",
            description: "Principal and interest have been credited to your wallet.",
            details: [
              { label: "Principal", value: `₦${Number(s.principal).toLocaleString()}` },
              { label: "Interest Earned", value: `+₦${interest.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
              { label: "Total Credited", value: `₦${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, highlight: true },
              { label: "Maturity Date", value: new Date().toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" }) },
              { label: "Date", value: new Date().toLocaleString("en-NG") },
            ],
            reference: `MAT-${s.id.slice(0, 8).toUpperCase()}`,
          });
          await loadAll();
          onRefresh();
        }
      },
    });
  };

  const handleEarlyWithdraw = (s: VS) => {
    setPinGate({
      purpose: "Early withdrawal",
      description: `Withdraw ₦${Number(s.principal).toLocaleString()} early`,
      onAuthorized: async () => {
        const result = await vestara.earlyWithdrawSavings(s.id);
        if (result && !result.error) {
          const penalty = Number(result.penalty || 0);
          const principal = Number(s.principal);
          const credited = principal - penalty;
          setSuccessPayload({
            title: "Early Withdrawal Complete",
            description: penalty > 0
              ? "Funds returned to wallet. A penalty was deducted."
              : "Funds returned to your wallet. No penalty applied.",
            details: [
              { label: "Principal", value: `₦${principal.toLocaleString()}` },
              ...(penalty > 0 ? [{ label: "Penalty Deducted", value: `−₦${penalty.toLocaleString(undefined, { maximumFractionDigits: 2 })}` }] : [{ label: "Penalty", value: "₦0.00" }]),
              { label: "Net Credited", value: `₦${credited.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, highlight: true },
              { label: "Status", value: "Credited to wallet" },
              { label: "Date", value: new Date().toLocaleString("en-NG") },
            ],
            reference: `EW-${s.id.slice(0, 8).toUpperCase()}`,
          });
          await loadAll();
          onRefresh();
        }
      },
    });
  };

  const activeSavings = savings.filter(s => s.status === "active" && s.approval_status !== "pending");

  const totals = useMemo(() => {
    const active = savings.filter(s => s.status === "active" && s.approval_status !== "pending");
    return {
      principal: active.reduce((sum, s) => sum + Number(s.principal || 0), 0),
      interest: active.reduce(
        (sum, s) => sum + Number(s.accrued_interest || 0) + Number(s.discounted_interest_paid || 0), 0),
      activeCount: active.length,
    };
  }, [savings]);

  // Chips: product types the user actually holds
  const productChips = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const s of savings) {
      const key = s.product_code as string;
      const label = s.vestara_products?.name || key;
      const prev = map.get(key);
      map.set(key, { label, count: (prev?.count || 0) + 1 });
    }
    return Array.from(map.entries()).map(([code, v]) => ({ code, ...v }));
  }, [savings]);

  const visibleSavings = useMemo(
    () => (planFilter === "all" ? savings : savings.filter(s => s.product_code === planFilter)),
    [savings, planFilter],
  );

  // Group visible plans by product, active plans first inside each group
  const grouped = useMemo(() => {
    const order: PlanState[] = ["ready", "active", "pending", "rejected", "matured", "closed"];
    const map = new Map<string, { label: string; items: VS[] }>();
    for (const s of visibleSavings) {
      const key = s.product_code as string;
      const entry = map.get(key) || { label: s.vestara_products?.name || key, items: [] };
      entry.items.push(s);
      map.set(key, entry);
    }
    for (const g of map.values()) {
      g.items.sort((a, b) => order.indexOf(planState(a)) - order.indexOf(planState(b)));
    }
    return Array.from(map.values());
  }, [visibleSavings]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold">All Active Savings</h2>
          <p className="text-xs text-muted-foreground">Every investment, in one place</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { loadAll(); onRefresh(); }} disabled={loadingData || vestara.loading}>
          <RefreshCw className={`h-4 w-4 ${(loadingData || vestara.loading) ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Balance Summary */}
      {userBalance ? (
        <div className="bg-card rounded-2xl border border-border/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Available to Save</span>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">₦{availableBalance.toLocaleString()}</p>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
            <span>Locked: ₦{Number(userBalance.locked_balance).toLocaleString()}</span>
            <span>Interest: ₦{Number(userBalance.savings_balance).toLocaleString()}</span>
          </div>
        </div>
      ) : (
        <Skeleton className="h-24 rounded-2xl" />
      )}

      {/* Portfolio Overview */}
      {!loadingData && savings.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-success/5 border border-primary/20 p-4 space-y-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Portfolio</span>
          <div>
            <p className="text-[10px] text-muted-foreground">Total locked</p>
            <p className="text-3xl font-bold tabular-nums leading-tight">
              ₦{totals.principal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-primary/10">
            <div>
              <p className="text-[10px] text-muted-foreground">Interest earned</p>
              <p className="text-sm font-bold text-success">
                +₦{totals.interest.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Active plans</p>
              <p className="text-sm font-bold">{totals.activeCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* Create flow */}
      {/* Goal Savings 2.0 wizard takes over the whole create area */}
      {showGoalV2 ? (
        <GoalSavingsV2Wizard
          onClose={() => { setShowGoalV2(false); loadAll(); onRefresh(); }}
          onCreated={() => { loadAll(); onRefresh(); }}
          walletAvailable={availableBalance}
        />
      ) : !showCreate ? (
        <Button onClick={() => setShowCreate(true)} className="w-full h-12" variant="hero">
          <Sparkles className="h-4 w-4 mr-2" /> Start a New Savings
        </Button>
      ) : (
        <AnimatePresence mode="wait">
          {/* Step 1: Product */}
          {step === "product" && (
            <motion.div
              key="product"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="bg-card rounded-2xl border border-border/50 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Step 1: Choose a Product</h3>
                <button onClick={resetFlow} className="text-xs text-muted-foreground">Cancel</button>
              </div>

              {loadingData ? (
                <div className="grid grid-cols-1 gap-3">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {products.map(p => {
                    const Icon = PRODUCT_ICONS[p.code] || Lock;
                    const grad = PRODUCT_GRADIENTS[p.code] || "";
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (p.code === "goalsave") {
                            setShowCreate(false);
                            setShowGoalV2(true);
                            return;
                          }
                          setSelectedProduct(p);
                          setStep("amount");
                        }}
                        className={`text-left rounded-2xl border bg-gradient-to-br ${grad} p-4 hover:shadow-md transition-all`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-xl bg-background/60 flex items-center justify-center">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-bold">{p.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {p.min_user_rate}–{p.max_user_rate}% p.a. • {p.min_tenor_days}–{p.max_tenor_days}d
                              </p>
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        {p.description && (
                          <p className="text-[11px] text-muted-foreground mt-2">{p.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {p.is_upfront_yield && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-amber-500/40 text-amber-600">Upfront interest</Badge>
                          )}
                          {!p.allow_early_withdrawal && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-destructive/30 text-destructive">No early exit</Badge>
                          )}
                          {p.allow_early_withdrawal && p.early_withdrawal_penalty_pct > 0 && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-warning/40 text-warning">
                              {p.early_withdrawal_penalty_pct}% penalty
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* Step 2: Amount */}
          {step === "amount" && selectedProduct && (
            <motion.div
              key="amount"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="bg-card rounded-2xl border border-border/50 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <button onClick={() => setStep("product")} className="text-xs text-primary font-medium flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
                <button onClick={resetFlow} className="text-xs text-muted-foreground">Cancel</button>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Step 2: Enter Amount</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">{selectedProduct.name}</p>
              </div>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount to save"
                className="text-center text-lg font-semibold h-14"
                min={100}
              />
              <div className="flex gap-2 flex-wrap">
                {[5000, 10000, 25000, 50000, 100000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt.toString())}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      amount === amt.toString()
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border/50 hover:border-primary/30"
                    }`}
                  >
                    ₦{amt.toLocaleString()}
                  </button>
                ))}
              </div>
              {exceedsAvailable && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Exceeds available balance (₦{availableBalance.toLocaleString()})
                </p>
              )}
              <Button
                onClick={() => setStep("tenor")}
                disabled={!amount || isNaN(amtNum) || amtNum <= 0 || exceedsAvailable}
                className="w-full"
              >
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* Step 3: Tenor */}
          {step === "tenor" && selectedProduct && (
            <motion.div
              key="tenor"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="bg-card rounded-2xl border border-border/50 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <button onClick={() => setStep("amount")} className="text-xs text-primary font-medium flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
                <button onClick={resetFlow} className="text-xs text-muted-foreground">Cancel</button>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Step 3: Select Tenor</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  ₦{amtNum.toLocaleString()} • {selectedProduct.name}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {tenorPresets.map(d => {
                  const isSel = tenor === d;
                  const r = computeUserRate(selectedProduct, d);
                  return (
                    <button
                      key={d}
                      onClick={() => setTenor(d)}
                      className={`rounded-2xl border-2 p-3 text-center transition-all ${
                        isSel ? "border-primary bg-primary/5 shadow-md" : "border-border/50 bg-card hover:border-primary/30"
                      }`}
                    >
                      <p className="text-base font-bold">{d}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">d</span></p>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <Percent className="h-2.5 w-2.5 text-success" />
                        <span className="text-[10px] font-semibold text-success">{r.toFixed(2)}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Button onClick={() => setStep("confirm")} disabled={!tenor} className="w-full">
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* Step 4: Confirm */}
          {step === "confirm" && selectedProduct && tenor && preview && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="bg-card rounded-2xl border border-border/50 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <button onClick={() => setStep("tenor")} className="text-xs text-primary font-medium flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
                <button onClick={resetFlow} className="text-xs text-muted-foreground">Cancel</button>
              </div>
              <h3 className="text-sm font-semibold">Step 4: Confirm</h3>

              <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-success/5 border border-primary/20 p-5 space-y-3">
                {[
                  { label: "Product", value: selectedProduct.name, bold: true },
                  { label: "Principal", value: `₦${amtNum.toLocaleString()}`, bold: true },
                  { label: "Tenor", value: `${tenor} days` },
                  { label: "User Rate", value: `${preview.rate.toFixed(2)}% p.a.` },
                  ...(preview.upfront
                    ? [
                        { label: "Discounted Interest (paid now)", value: `+₦${(preview.discountedInterest ?? 0).toLocaleString()}`, color: "text-success" },
                        { label: "Net Wallet Debit", value: `₦${(preview.netDebit ?? 0).toLocaleString()}`, bold: true },
                      ]
                    : [
                        { label: "Interest at Maturity", value: `+₦${(preview.interest ?? 0).toLocaleString()}`, color: "text-success" },
                        { label: "Total at Maturity", value: `₦${(preview.total ?? 0).toLocaleString()}`, bold: true },
                      ]),
                  { label: "Maturity Date", value: preview.maturityDate.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" }) },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center gap-3">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className={`text-sm text-right ${item.bold ? "font-bold" : "font-medium"} ${item.color || ""}`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-warning/5 border border-warning/20 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  {selectedProduct.allow_early_withdrawal
                    ? `Early withdrawal incurs a ${selectedProduct.early_withdrawal_penalty_pct}% penalty on accrued interest.`
                    : "Early withdrawal is not allowed for this product."}
                </p>
              </div>

              <Button onClick={handleConfirm} disabled={vestara.loading} className="w-full h-12" variant="hero">
                {vestara.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                Confirm & Lock Funds
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* My Savings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">
            My Savings {savings.length > 0 && <span className="text-muted-foreground font-normal">({savings.length})</span>}
          </h3>
        </div>

        {/* Product filter chips */}
        {!loadingData && productChips.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-none">
            <FilterChip active={planFilter === "all"} onClick={() => setPlanFilter("all")} label={`All · ${savings.length}`} />
            {productChips.map(c => (
              <FilterChip
                key={c.code}
                active={planFilter === c.code}
                onClick={() => setPlanFilter(c.code)}
                label={`${c.label} · ${c.count}`}
              />
            ))}
          </div>
        )}

        {loadingData ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : savings.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/50 p-8 text-center">
            <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No savings yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start a new savings to grow your money.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(group => {
              const activeInGroup = group.items.filter(
                s => planState(s) === "active" || planState(s) === "ready",
              ).length;
              return (
                <div key={group.label} className="space-y-2.5">
                  <div className="flex items-center gap-2 sticky top-0 bg-background/90 backdrop-blur-sm py-1 z-10">
                    <h4 className="text-xs font-semibold uppercase tracking-wide">{group.label}</h4>
                    <span className="text-[11px] text-muted-foreground">
                      {activeInGroup} active{group.items.length !== activeInGroup ? ` · ${group.items.length - activeInGroup} other` : ""}
                    </span>
                  </div>
                  {group.items.map(s => (
                    <SavingsPlanCard
                      key={s.id}
                      savings={s}
                      mandate={findMandate("fd_investment", s.id)}
                      busy={vestara.loading}
                      onMature={handleMature}
                      onEarlyWithdraw={handleEarlyWithdraw}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transaction PIN gate */}
      <TransactionPinGate
        open={!!pinGate}
        onOpenChange={(o) => { if (!o) setPinGate(null); }}
        purpose={pinGate?.purpose || ""}
        description={pinGate?.description}
        onVerified={() => {
          const cb = pinGate?.onAuthorized;
          setPinGate(null);
          cb?.();
        }}
      />

      {/* Success modal */}
      <TransactionSuccessModal
        open={!!successPayload}
        onOpenChange={(o) => { if (!o) setSuccessPayload(null); }}
        payload={successPayload}
      />
    </div>
  );
}
