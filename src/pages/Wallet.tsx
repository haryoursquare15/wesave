import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, ArrowUpRight, ArrowDownLeft, Lock, History, Percent, Copy, Check, CreditCard } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface Transaction {
  id: string;
  type: string;
  description: string | null;
  amount: number;
  status: string;
  created_at: string;
}

export default function Wallet() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, wallet, profile, refreshWallet, loading: authLoading } = useAuth();
  const [showBalance, setShowBalance] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingVA, setCreatingVA] = useState(false);

  const balance = Number(wallet?.available_balance) || 0;
  const lockedBalance = Number(wallet?.locked_balance) || 0;

  // Check for funding redirect status and verify pending transactions
  useEffect(() => {
    const verifyPendingTransactions = async () => {
      if (!user) return;
      
      const fundingStatus = searchParams.get("funding");
      
      // Get pending funding transactions and verify them
      try {
        const { data: pendingTxs } = await supabase
          .from("transactions")
          .select("reference")
          .eq("user_id", user.id)
          .eq("type", "funding")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5);

        if (pendingTxs && pendingTxs.length > 0) {
          // Verify each pending transaction
          for (const tx of pendingTxs) {
            if (tx.reference) {
              const { data } = await supabase.functions.invoke("flutterwave-payments", {
                body: { action: "verify_transaction", tx_ref: tx.reference },
              });
              
              if (data?.success && data?.verified && !data?.already_completed) {
                toast.success(`₦${data.amount?.toLocaleString()} added to wallet!`);
              }
            }
          }
          // Refresh wallet and transactions
          refreshWallet();
          // Refetch transactions
          const { data: txData } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20);
          if (txData) setTransactions(txData);
        }
      } catch (err) {
        console.error("Error verifying transactions:", err);
      }

      // Show appropriate toast based on redirect status
      if (fundingStatus === "success") {
        // Transaction will be verified above
      } else if (fundingStatus === "failed") {
        toast.error("Wallet funding failed. Please try again.");
      }
    };

    verifyPendingTransactions();
  }, [searchParams, user, refreshWallet]);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Fetch transactions and setup realtime subscription
  useEffect(() => {
    async function fetchTransactions() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) throw error;
        setTransactions(data || []);
      } catch (err) {
        console.error("Error fetching transactions:", err);
      } finally {
        setLoadingTx(false);
      }
    }

    fetchTransactions();

    // Subscribe to wallet changes for real-time balance updates
    if (user) {
      const walletChannel = supabase
        .channel(`wallet-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "wallets",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            // Immediately refresh wallet on any change
            refreshWallet();
          }
        )
        .subscribe();

      // Subscribe to transaction changes for real-time tx list updates with notifications
      const txChannel = supabase
        .channel(`transactions-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "transactions",
            filter: `user_id=eq.${user.id}`,
          },
          async (payload) => {
            // Show toast notification for new transactions
            const newTx = payload.new as Transaction;
            if (newTx) {
              const amount = Number(newTx.amount).toLocaleString();
              switch (newTx.type) {
                case "funding":
                  toast.success(`💰 ₦${amount} added to your wallet!`);
                  break;
                case "payout":
                  toast.success(`🎉 You received a payout of ₦${amount}!`);
                  break;
                case "contribution":
                  toast.info(`📤 Contribution of ₦${amount} made successfully`);
                  break;
                case "withdrawal":
                  toast.info(`💸 Withdrawal of ₦${amount} processed`);
                  break;
                case "lock":
                  toast.info(`🔒 ₦${amount} locked in savings`);
                  break;
                case "unlock":
                  toast.info(`🔓 ₦${amount} unlocked from savings`);
                  break;
                case "service_fee":
                  // Don't show notification for service fees
                  break;
                default:
                  toast.info(`Transaction: ₦${amount}`);
              }
            }
            
            // Refetch transactions on new entry
            const { data } = await supabase
              .from("transactions")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(20);
            if (data) setTransactions(data);
            // Also refresh wallet balance
            refreshWallet();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(walletChannel);
        supabase.removeChannel(txChannel);
      };
    }
  }, [user, refreshWallet]);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-NG").format(amount);
  };

  const createVirtualAccount = async () => {
    if (!profile?.bvn || !profile?.bank_account) {
      toast.error("Please complete onboarding with your BVN and bank details first.");
      navigate("/onboarding");
      return;
    }

    setCreatingVA(true);
    try {
      const { data, error } = await supabase.functions.invoke("flutterwave-subaccount", {
        body: { action: "create_virtual_account" },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Virtual account created successfully!");
        refreshWallet();
      } else {
        toast.error(data.error || "Failed to create virtual account");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create virtual account";
      toast.error(errorMessage);
    } finally {
      setCreatingVA(false);
    }
  };

  const handleFund = async () => {
    const amount = Number(fundAmount);
    if (!amount || amount < 100) {
      toast.error("Minimum funding amount is ₦100");
      return;
    }

    setFunding(true);
    try {
      const { data, error } = await supabase.functions.invoke("flutterwave-payments", {
        body: { action: "fund_wallet", amount },
      });

      if (error) throw error;

      if (data.success && data.payment_link) {
        // Redirect to payment page
        window.location.href = data.payment_link;
      } else {
        toast.error(data.error || "Failed to initiate payment");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to initiate payment";
      toast.error(errorMessage);
    } finally {
      setFunding(false);
    }
  };

  const copyAccountNumber = () => {
    if (profile?.flw_virtual_account_number) {
      navigator.clipboard.writeText(profile.flw_virtual_account_number);
      setCopied(true);
      toast.success("Account number copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "funding":
      case "payout":
        return <ArrowDownLeft className="h-5 w-5" />;
      case "contribution":
      case "withdrawal":
        return <ArrowUpRight className="h-5 w-5" />;
      case "lock":
        return <Lock className="h-4 w-4" />;
      default:
        return <CreditCard className="h-5 w-5" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case "funding":
      case "payout":
        return "bg-success/10 text-success";
      case "contribution":
      case "withdrawal":
        return "bg-coral/10 text-coral";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

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
              <Button 
                className="flex-1 bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
                onClick={() => setFundDialogOpen(true)}
              >
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
        {/* Virtual Account Card */}
        {profile?.flw_virtual_account_number ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-card border border-border"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Your Virtual Account</p>
              <button
                onClick={copyAccountNumber}
                className="text-primary hover:text-primary/80 transition-colors"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-lg font-mono font-semibold text-foreground">
              {profile.flw_virtual_account_number}
            </p>
            <p className="text-sm text-muted-foreground">
              {profile.flw_virtual_bank_name}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Transfer to this account to fund your wallet instantly
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-gold/10 border border-gold/20"
          >
            <p className="text-sm font-medium text-foreground mb-2">
              Create a Virtual Account
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Get a dedicated account number for instant wallet funding
            </p>
            <Button 
              variant="gold" 
              size="sm" 
              onClick={createVirtualAccount}
              disabled={creatingVA}
            >
              {creatingVA ? (
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              ) : null}
              Create Now
            </Button>
          </motion.div>
        )}

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
          </div>

          {loadingTx ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((tx, index) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-card border border-border"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${getTransactionColor(tx.type)}`}>
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm capitalize">
                        {tx.description || tx.type.replace("_", " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(tx.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                  <span className={`font-semibold ${
                    tx.type === "funding" || tx.type === "payout" 
                      ? "text-success" 
                      : "text-foreground"
                  }`}>
                    {tx.type === "funding" || tx.type === "payout" ? "+" : "-"}₦{formatAmount(tx.amount)}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No transactions yet</p>
            </div>
          )}
        </section>
      </main>

      {/* Fund Dialog */}
      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fund Your Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₦)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                min={100}
              />
              <p className="text-xs text-muted-foreground">Minimum: ₦100</p>
            </div>
            <Button 
              onClick={handleFund} 
              disabled={funding || !fundAmount}
              className="w-full"
            >
              {funding ? (
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              ) : null}
              Continue to Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
