import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import {
  Wallet, Lock, Users, Target, Heart, Receipt, Send,
  CreditCard, Eye, EyeOff, TrendingUp, Plus, ArrowDownLeft, ArrowUpRight,
  Shield, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface BalanceData {
  totalBalance: number;
  availableBalance: number;
  lockedBalance: number;
  savingsBalance: number;
  accountNumber: string;
  fullName: string;
}

interface SandboxDashboardProps {
  balance: BalanceData;
  onNavigate: (tab: string) => void;
}

function AnimatedNumber({ value, prefix = "₦" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 600;
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

const quickActions = [
  { key: "fund", label: "Fund", icon: ArrowDownLeft, color: "bg-success/10 text-success" },
  { key: "transfer", label: "Transfer", icon: ArrowUpRight, color: "bg-primary/10 text-primary" },
  { key: "lock", label: "Lock", icon: Lock, color: "bg-warning/10 text-warning" },
  { key: "history", label: "History", icon: TrendingUp, color: "bg-muted text-muted-foreground" },
];

const products = [
  { key: "ajo", label: "Thrift (Ajo)", icon: Users, desc: "Rotational savings", color: "bg-primary/10 text-primary" },
  { key: "target", label: "Target Ajo", icon: Target, desc: "Goal-based savings", color: "bg-success/10 text-success" },
  { key: "goal", label: "Goal Funding", icon: Heart, desc: "Crowdfunding", color: "bg-coral/10 text-coral" },
  { key: "split", label: "SplitPay", icon: Receipt, desc: "Split bills", color: "bg-warning/10 text-warning" },
];

export function SandboxDashboard({ balance, onNavigate }: SandboxDashboardProps) {
  const [showBalance, setShowBalance] = useState(true);

  return (
    <div className="space-y-5">
      {/* Main Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground shadow-xl"
      >
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary-foreground" />
          <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-primary-foreground" />
          <div className="absolute right-1/3 top-1/2 h-16 w-16 rounded-full bg-primary-foreground" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 opacity-80" />
              <span className="text-xs font-medium opacity-80">Total Balance</span>
            </div>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="p-1.5 hover:bg-primary-foreground/10 rounded-full transition-colors"
            >
              {showBalance ? <Eye className="h-4 w-4 opacity-80" /> : <EyeOff className="h-4 w-4 opacity-80" />}
            </button>
          </div>

          <motion.h2
            key={showBalance ? "shown" : "hidden"}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-3xl font-bold tracking-tight mb-1"
          >
            {showBalance ? <AnimatedNumber value={balance.totalBalance} /> : "••••••••"}
          </motion.h2>

          <p className="text-xs opacity-60 mb-4">
            {balance.accountNumber} • {balance.fullName}
          </p>

          {/* Balance Breakdown */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Available", value: balance.availableBalance },
              { label: "Locked", value: balance.lockedBalance },
              { label: "Savings", value: balance.savingsBalance },
            ].map((item) => (
              <div key={item.label} className="bg-primary-foreground/10 rounded-xl px-2.5 py-2 text-center">
                <p className="text-[10px] opacity-70">{item.label}</p>
                <p className="text-xs font-semibold">
                  {showBalance ? `₦${item.value.toLocaleString()}` : "••••"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="grid grid-cols-4 gap-3"
      >
        {quickActions.map((action) => (
          <button
            key={action.key}
            onClick={() => onNavigate(action.key)}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className={`w-12 h-12 rounded-2xl ${action.color} flex items-center justify-center transition-transform group-active:scale-95`}>
              <action.icon className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">{action.label}</span>
          </button>
        ))}
      </motion.div>

      {/* Trust Banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="flex items-center gap-2.5 rounded-xl bg-success/5 border border-success/20 px-4 py-2.5"
      >
        <Shield className="h-4 w-4 text-success shrink-0" />
        <div className="flex-1">
          <p className="text-[11px] font-medium text-success">Your funds are secure</p>
          <p className="text-[10px] text-muted-foreground">Powered by VFD MicroFinance Bank</p>
        </div>
      </motion.div>

      {/* Products */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Products</h3>
        </div>
        <div className="space-y-2">
          {products.map((product) => (
            <button
              key={product.key}
              onClick={() => onNavigate(product.key)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all group active:scale-[0.98]"
            >
              <div className={`w-10 h-10 rounded-xl ${product.color} flex items-center justify-center shrink-0`}>
                <product.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">{product.label}</p>
                <p className="text-[11px] text-muted-foreground">{product.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
