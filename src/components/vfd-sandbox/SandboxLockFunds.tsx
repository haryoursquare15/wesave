import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, Unlock, TrendingUp, ArrowLeft,
  RefreshCw, Percent, ArrowRight, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface LockConfig {
  id: string; duration_months: number; interest_rate: number; early_withdrawal_penalty: number;
}
interface LockedFund {
  id: string; principal_amount: number; interest_rate: number; duration_months: number;
  expected_interest: number; total_payout: number; start_date: string; maturity_date: string;
  actual_unlock_date: string | null; penalty_amount: number; status: string;
}
interface UserBalance {
  total_balance: number; locked_balance: number; savings_balance: number; available_balance: number;
}

interface Props {
  lockConfigs: LockConfig[];
  lockedFunds: LockedFund[];
  userBalance: UserBalance | null;
  loading: boolean;
  onCreateLock: (amount: number, duration: number) => Promise<void>;
  onUnlock: (lockId: string) => Promise<void>;
  onBreakLock: (lockId: string) => Promise<void>;
  onRefresh: () => void;
  onBack: () => void;
}

type FlowStep = "amount" | "duration" | "confirm";

export function SandboxLockFunds({
  lockConfigs, lockedFunds, userBalance, loading,
  onCreateLock, onUnlock, onBreakLock, onRefresh, onBack,
}: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<FlowStep>("amount");
  const [amount, setAmount] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selectedConfig = lockConfigs.find(c => c.duration_months === selectedDuration);
  const amtNum = parseFloat(amount);
  const availableBalance = Number(userBalance?.available_balance || 0);
  const exceedsAvailable = !isNaN(amtNum) && amtNum > availableBalance;
  const preview = selectedConfig && !isNaN(amtNum) && amtNum > 0 ? (() => {
    const interest = amtNum * (selectedConfig.interest_rate / 100) * (selectedConfig.duration_months / 12);
    const maturity = new Date();
    maturity.setMonth(maturity.getMonth() + selectedConfig.duration_months);
    return { interest: Math.round(interest * 100) / 100, total: Math.round((amtNum + interest) * 100) / 100, maturityDate: maturity };
  })() : null;

  const handleConfirm = async () => {
    if (!selectedDuration || isNaN(amtNum)) return;
    if (amtNum > availableBalance) {
      toast({
        title: "Insufficient available balance",
        description: `You only have ₦${availableBalance.toLocaleString()} available to lock.`,
        variant: "destructive",
      });
      return;
    }
    await onCreateLock(amtNum, selectedDuration);
    setStep("amount");
    setAmount("");
    setSelectedDuration(null);
    setShowCreate(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold">Lock Funds</h2>
          <p className="text-xs text-muted-foreground">Earn interest on your savings</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Balance Summary */}
      {userBalance ? (
        <div className="bg-card rounded-2xl border border-border/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Available to Lock</span>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">₦{Number(userBalance.available_balance).toLocaleString()}</p>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
            <span>Locked: ₦{Number(userBalance.locked_balance).toLocaleString()}</span>
            <span>Savings: ₦{Number(userBalance.savings_balance).toLocaleString()}</span>
          </div>
        </div>
      ) : (
        <Skeleton className="h-24 rounded-2xl" />
      )}

      {/* Create Lock Button / Flow */}
      {!showCreate ? (
        <Button onClick={() => setShowCreate(true)} className="w-full h-12" variant="hero">
          <Lock className="h-4 w-4 mr-2" /> Create New Lock
        </Button>
      ) : (
        <AnimatePresence mode="wait">
          {/* Step 1: Amount */}
          {step === "amount" && (
            <motion.div
              key="amount"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-card rounded-2xl border border-border/50 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Step 1: Enter Amount</h3>
                <button onClick={() => setShowCreate(false)} className="text-xs text-muted-foreground">Cancel</button>
              </div>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount to lock"
                className="text-center text-lg font-semibold h-14"
                min={100}
              />
              <div className="flex gap-2 flex-wrap">
                {[5000, 10000, 25000, 50000, 100000].map((amt) => (
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
                  Amount exceeds available balance (₦{availableBalance.toLocaleString()})
                </p>
              )}
              <Button
                onClick={() => setStep("duration")}
                disabled={!amount || isNaN(amtNum) || amtNum <= 0 || exceedsAvailable}
                className="w-full"
              >
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* Step 2: Duration */}
          {step === "duration" && (
            <motion.div
              key="duration"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-card rounded-2xl border border-border/50 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Step 2: Select Duration</h3>
                <button onClick={() => setStep("amount")} className="text-xs text-primary font-medium flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
              </div>

              <p className="text-sm text-muted-foreground">Locking ₦{amtNum.toLocaleString()}</p>

              <div className="grid grid-cols-2 gap-3">
                {lockConfigs.map((cfg) => {
                  const isSelected = selectedDuration === cfg.duration_months;
                  const estInterest = amtNum * (cfg.interest_rate / 100) * (cfg.duration_months / 12);
                  return (
                    <button
                      key={cfg.duration_months}
                      onClick={() => setSelectedDuration(cfg.duration_months)}
                      className={`rounded-2xl border-2 p-4 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-border/50 bg-card hover:border-primary/30"
                      }`}
                    >
                      <p className="text-lg font-bold">{cfg.duration_months}<span className="text-xs font-normal text-muted-foreground ml-0.5">mo</span></p>
                      <div className="flex items-center gap-1 mt-1">
                        <Percent className="h-3 w-3 text-success" />
                        <span className="text-xs font-semibold text-success">{cfg.interest_rate}% p.a.</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        You earn <span className="font-semibold text-success">₦{Math.round(estInterest).toLocaleString()}</span>
                      </p>
                    </button>
                  );
                })}
              </div>

              <Button
                onClick={() => setStep("confirm")}
                disabled={!selectedDuration}
                className="w-full"
              >
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* Step 3: Confirm */}
          {step === "confirm" && preview && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-card rounded-2xl border border-border/50 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Step 3: Confirm Lock</h3>
                <button onClick={() => setStep("duration")} className="text-xs text-primary font-medium flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-success/5 border border-primary/20 p-5 space-y-3">
                {[
                  { label: "Amount to Lock", value: `₦${amtNum.toLocaleString()}`, bold: true },
                  { label: "Duration", value: `${selectedDuration} months` },
                  { label: "Interest Rate", value: `${selectedConfig?.interest_rate}% per annum` },
                  { label: "Interest Earned", value: `+₦${preview.interest.toLocaleString()}`, color: "text-success" },
                  { label: "Total at Maturity", value: `₦${preview.total.toLocaleString()}`, bold: true },
                  { label: "Maturity Date", value: preview.maturityDate.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" }) },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className={`text-sm ${item.bold ? "font-bold" : "font-medium"} ${item.color || ""}`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-warning/5 border border-warning/20 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Early withdrawal will incur a penalty of {selectedConfig?.early_withdrawal_penalty}% of accrued interest.
                </p>
              </div>

              <Button onClick={handleConfirm} disabled={loading} className="w-full h-12" variant="hero">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                Confirm & Lock Funds
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Active Locks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">
            My Locks {lockedFunds.length > 0 && <span className="text-muted-foreground font-normal">({lockedFunds.length})</span>}
          </h3>
        </div>

        {lockedFunds.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/50 p-8 text-center">
            <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No locked funds yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first lock to start earning interest</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lockedFunds.map((lock) => {
              const isMatured = new Date() >= new Date(lock.maturity_date);
              const elapsed = Date.now() - new Date(lock.start_date).getTime();
              const total = new Date(lock.maturity_date).getTime() - new Date(lock.start_date).getTime();
              const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
              const daysLeft = Math.max(0, Math.ceil((new Date(lock.maturity_date).getTime() - Date.now()) / 86400000));

              return (
                <motion.div
                  key={lock.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-2xl border border-border/50 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold">₦{Number(lock.principal_amount).toLocaleString()}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {lock.duration_months}mo @ {lock.interest_rate}% p.a.
                      </p>
                    </div>
                    <Badge
                      className={`text-[10px] px-2.5 py-0.5 rounded-full ${
                        lock.status === "active" && isMatured ? "bg-success/10 text-success border-success/30"
                        : lock.status === "active" ? "bg-warning/10 text-warning border-warning/30"
                        : lock.status === "matured" ? "bg-success/10 text-success border-success/30"
                        : "bg-destructive/10 text-destructive border-destructive/30"
                      }`}
                      variant="outline"
                    >
                      {lock.status === "active" && isMatured ? "✓ Ready" : lock.status}
                    </Badge>
                  </div>

                  {lock.status === "active" && (
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                        <span>{new Date(lock.start_date).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}</span>
                        <span>{isMatured ? "Matured!" : `${daysLeft}d left`}</span>
                        <span>{new Date(lock.maturity_date).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-success">
                      <TrendingUp className="h-3 w-3" />
                      <span>+₦{Number(lock.expected_interest).toLocaleString()}</span>
                    </div>
                    <span className="text-muted-foreground">Total: ₦{Number(lock.total_payout).toLocaleString()}</span>
                  </div>

                  {lock.status === "active" && (
                    <div className="flex gap-2">
                      {isMatured ? (
                        <Button size="sm" className="flex-1 bg-success hover:bg-success/90 text-success-foreground" onClick={() => onUnlock(lock.id)} disabled={loading}>
                          <Unlock className="h-3.5 w-3.5 mr-1.5" /> Unlock & Earn
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => onBreakLock(lock.id)} disabled={loading}>
                          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Break Lock
                        </Button>
                      )}
                    </div>
                  )}

                  {lock.status === "broken" && lock.penalty_amount > 0 && (
                    <p className="text-[11px] text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Penalty: ₦{Number(lock.penalty_amount).toLocaleString()}
                    </p>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
