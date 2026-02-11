import { motion } from "framer-motion";
import { Wallet, Eye, EyeOff, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface WalletCardProps {
  balance: number;
  currency?: string;
  onFund?: () => void;
  onWithdraw?: () => void;
}

export function WalletCard({
  balance,
  currency = "₦",
  onFund,
  onWithdraw,
}: WalletCardProps) {
  const [showBalance, setShowBalance] = useState(true);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-NG").format(amount);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/80 p-6 text-primary-foreground shadow-xl"
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/10" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            <span className="text-sm font-medium opacity-90">Main Wallet</span>
          </div>
          <button
            onClick={() => setShowBalance(!showBalance)}
            className="p-1 hover:bg-white/10 rounded-full transition-colors"
          >
            {showBalance ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </button>
        </div>

        {/* Balance */}
        <div className="mb-6">
          <p className="text-sm opacity-75 mb-1">Available Balance</p>
          <h2 className="text-3xl font-bold tracking-tight">
            {showBalance ? `${currency}${formatAmount(balance)}` : "••••••••"}
          </h2>
        </div>


        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={onFund}
            variant="secondary"
            className="flex-1 bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
          >
            <ArrowDownLeft className="h-4 w-4" />
            Fund
          </Button>
          <Button
            onClick={onWithdraw}
            variant="secondary"
            className="flex-1 bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
          >
            <ArrowUpRight className="h-4 w-4" />
            Withdraw
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
