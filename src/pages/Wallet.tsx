import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, ArrowUpRight, ArrowDownLeft, Lock, History, Plus, Percent } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { Badge } from "@/components/ui/badge";

const transactions = [
  { id: 1, type: "credit", description: "Payout - Family Savings", amount: 250000, date: "Today, 2:30 PM" },
  { id: 2, type: "debit", description: "Contribution - Office Thrift", amount: 25000, date: "Yesterday" },
  { id: 3, type: "credit", description: "Wallet Fund", amount: 100000, date: "Jan 15, 2024" },
  { id: 4, type: "debit", description: "Contribution - Family Savings", amount: 50000, date: "Jan 14, 2024" },
];

export default function Wallet() {
  const navigate = useNavigate();
  const [showBalance, setShowBalance] = useState(true);
  const balance = 275000;
  const lockedBalance = 50000;

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-NG").format(amount);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header with Wallet */}
      <div className="bg-gradient-to-br from-primary via-primary to-primary/80 pb-8">
        <header className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate(-1)}
              className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center text-primary-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-primary-foreground">Wallet</h1>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center text-primary-foreground"
            >
              {showBalance ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </button>
          </div>

          {/* Balance Display */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <p className="text-primary-foreground/70 text-sm mb-1">Available Balance</p>
            <h2 className="text-4xl font-bold text-primary-foreground mb-4">
              {showBalance ? `₦${formatAmount(balance)}` : "••••••••"}
            </h2>
            
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 text-primary-foreground text-sm">
                <Lock className="h-3 w-3" />
                {showBalance ? `₦${formatAmount(lockedBalance)}` : "••••"} locked
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 max-w-xs mx-auto">
              <Button className="flex-1 bg-white/20 hover:bg-white/30 text-primary-foreground border-0">
                <ArrowDownLeft className="h-4 w-4 mr-2" />
                Fund
              </Button>
              <Button className="flex-1 bg-white/20 hover:bg-white/30 text-primary-foreground border-0">
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Withdraw
              </Button>
            </div>
          </motion.div>
        </header>
      </div>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            className="p-4 rounded-xl bg-card border border-border flex items-center gap-3"
          >
            <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-gold" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground text-sm">Lock Funds</p>
              <p className="text-xs text-muted-foreground">Earn interest</p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileHover={{ scale: 1.02 }}
            className="p-4 rounded-xl bg-card border border-border flex items-center gap-3"
          >
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Percent className="h-5 w-5 text-success" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground text-sm">Interest</p>
              <p className="text-xs text-muted-foreground">5% p.a.</p>
            </div>
          </motion.button>
        </div>

        {/* Transaction History */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <History className="h-4 w-4" />
              Recent Transactions
            </h3>
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </div>

          <div className="space-y-3">
            {transactions.map((tx, index) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between p-4 rounded-xl bg-card border border-border"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      tx.type === "credit"
                        ? "bg-success/10 text-success"
                        : "bg-coral/10 text-coral"
                    }`}
                  >
                    {tx.type === "credit" ? (
                      <ArrowDownLeft className="h-5 w-5" />
                    ) : (
                      <ArrowUpRight className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{tx.date}</p>
                  </div>
                </div>
                <span
                  className={`font-semibold ${
                    tx.type === "credit" ? "text-success" : "text-foreground"
                  }`}
                >
                  {tx.type === "credit" ? "+" : "-"}₦{formatAmount(tx.amount)}
                </span>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
