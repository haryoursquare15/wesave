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

interface UserBalance {
  total_balance: number; locked_balance: number; savings_balance: number; available_balance: number;
}

interface Props {
  userBalance: UserBalance | null;
  onRefresh: () => void;
  onBack: () => void;
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

export function SandboxSavings({ userBalance, onRefresh, onBack }: Props) {
  const { toast } = useToast();
  const vestara = useVestaraLedger();

  const [products, setProducts] = useState<VestaraProduct[]>([]);
  const [savings, setSavings] = useState<VS[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<FlowStep>("product");
  const [selectedProduct, setSelectedProduct] = useState<VestaraProduct | null>(null);
  const [amount, setAmount] = useState("");
  const [tenor, setTenor] = useState<number | null>(null);

  // PIN gate + success modal state
  const [pinGate, setPinGate] = useState<null | { purpose: string; description: string; onAuthorized: () => void }>(null);
  const [successPayload, setSuccessPayload] = useState<TransactionSuccessPayload | null>(null);

  const availableBalance = Number(userBalance?.available_balance || 0);

  const loadAll = async () => {
    setLoadingData(true);
    const [p, s] = await Promise.all([vestara.listProducts(), vestara.listSavings()]);
    setProducts(p);
    setSavings(s);
    setLoadingData(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            title: "Savings Created Successfully",
            description: `Your ${productName} plan is now active and earning.`,
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
        if (result?.success) {
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

  const activeSavings = savings.filter(s => s.status === "active");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold">Vestara Savings</h2>
          <p className="text-xs text-muted-foreground">Lock funds, earn interest</p>
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

      {/* Create flow */}
      {!showCreate ? (
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
                        onClick={() => { setSelectedProduct(p); setStep("amount"); }}
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

      {/* Active Savings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">
            My Savings {savings.length > 0 && <span className="text-muted-foreground font-normal">({savings.length})</span>}
          </h3>
        </div>

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
          <div className="space-y-3">
            {savings.map(s => {
              const isMatured = new Date() >= new Date(s.maturity_date);
              const elapsed = Date.now() - new Date(s.start_date).getTime();
              const total = new Date(s.maturity_date).getTime() - new Date(s.start_date).getTime();
              const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
              const daysLeft = Math.max(0, Math.ceil((new Date(s.maturity_date).getTime() - Date.now()) / 86400000));
              const productName = s.vestara_products?.name || s.product_code;
              const allowEarly = s.vestara_products?.allow_early_withdrawal ?? true;
              const Icon = PRODUCT_ICONS[s.product_code] || Lock;

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-2xl border border-border/50 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-muted/50 flex items-center justify-center">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{productName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          ₦{Number(s.principal).toLocaleString()} • {s.tenor_days}d @ {Number(s.user_rate).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-2.5 py-0.5 rounded-full ${
                        s.status === "active" && isMatured ? "bg-success/10 text-success border-success/30"
                        : s.status === "active" ? "bg-warning/10 text-warning border-warning/30"
                        : s.status === "matured" ? "bg-success/10 text-success border-success/30"
                        : "bg-destructive/10 text-destructive border-destructive/30"
                      }`}
                    >
                      {s.status === "active" && isMatured ? "✓ Ready" : s.status.replace("_", " ")}
                    </Badge>
                  </div>

                  {s.status === "active" && (
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                        <span>{new Date(s.start_date).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}</span>
                        <span>{isMatured ? "Matured!" : `${daysLeft}d left`}</span>
                        <span>{new Date(s.maturity_date).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-success">
                      <TrendingUp className="h-3 w-3" />
                      <span>
                        {s.discounted_interest_paid > 0 ? "Upfront" : "Accrued"}:{" "}
                        <span className="font-semibold">
                          +₦{Number(s.discounted_interest_paid > 0 ? s.discounted_interest_paid : s.accrued_interest).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </span>
                    </div>
                    {s.penalty_amount > 0 && (
                      <span className="text-destructive">Penalty: ₦{Number(s.penalty_amount).toLocaleString()}</span>
                    )}
                  </div>

                  {s.status === "active" && (
                    <div className="flex gap-2">
                      {isMatured ? (
                        <Button size="sm" className="flex-1 bg-success hover:bg-success/90 text-success-foreground" onClick={() => handleMature(s)} disabled={vestara.loading}>
                          <Unlock className="h-3.5 w-3.5 mr-1.5" /> Mature & Withdraw
                        </Button>
                      ) : allowEarly ? (
                        <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => handleEarlyWithdraw(s)} disabled={vestara.loading}>
                          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Withdraw Early
                        </Button>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic flex-1 text-center py-1">
                          Locked until maturity
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
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
