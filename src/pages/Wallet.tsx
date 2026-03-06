import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, ArrowUpRight, ArrowDownLeft, History, Copy, Check, CreditCard, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { invokeSecureFunction } from "@/lib/secureApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { WithdrawalBankForm } from "@/components/settings/WithdrawalBankForm";
import { getUserFriendlyError } from "@/lib/errorMessages";

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
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);

  const balance = Number(wallet?.available_balance) || 0;

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
              const { data } = await invokeSecureFunction({ action: "verify_transaction", tx_ref: tx.reference });
              
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

      // Show appropriate toast based on redirect status and navigate to dashboard
      if (fundingStatus === "success") {
        toast.success("Wallet funded successfully!");
        // Navigate to dashboard after successful funding
        navigate("/dashboard");
      } else if (fundingStatus === "failed") {
        toast.error("Wallet funding failed. Please try again.");
      }
    };

    verifyPendingTransactions();
  }, [searchParams, user, refreshWallet, navigate]);

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
            event: "*",
            schema: "public",
            table: "transactions",
            filter: `user_id=eq.${user.id}`,
          },
          async (payload) => {
            const newTx = payload.new as Transaction;
            // Only show toast for completed transactions (prevents premature notifications)
            if (newTx && newTx.status === "completed") {
              // For UPDATE events, only notify if the old status was not completed (transition to completed)
              const oldTx = payload.old as Partial<Transaction> | undefined;
              const wasAlreadyCompleted = payload.eventType === "UPDATE" && oldTx?.status === "completed";
              
              if (!wasAlreadyCompleted) {
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
                    break;
                  default:
                    toast.info(`Transaction: ₦${amount}`);
                }
              }
            }
            
            // Refetch transactions on any change
            const { data } = await supabase
              .from("transactions")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(20);
            if (data) setTransactions(data);
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

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount < 1000) {
      toast.error("Minimum withdrawal amount is ₦1,000");
      return;
    }
    const totalDebit = amount + 100;
    if (totalDebit > balance) {
      toast.error(`Insufficient balance. You need ₦${totalDebit.toLocaleString()} (₦${amount.toLocaleString()} + ₦100 transfer fee)`);
      return;
    }

    setWithdrawing(true);
    try {
      // Navigate to security settings for 2FA verification before withdrawal
      // The actual withdrawal will be processed after 2FA verification
      navigate("/settings/security?action=withdraw&amount=" + amount);
    } catch (err: unknown) {
      toast.error(getUserFriendlyError(err));
    } finally {
      setWithdrawing(false);
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
      const { data, error } = await invokeSecureFunction({ action: "fund_wallet", amount });

      if (error) throw error;

      if (data.success && data.payment_link) {
        // Redirect to payment page
        window.location.href = data.payment_link;
      } else {
        toast.error(data.error || "Failed to initiate payment");
      }
    } catch (err: unknown) {
      toast.error(getUserFriendlyError(err));
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
      case "split_payment":
        return <ArrowUpRight className="h-5 w-5" />;
      case "lock":
        return <CreditCard className="h-4 w-4" />;
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
      case "split_payment":
        return "bg-coral/10 text-coral";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatTransactionDescription = (tx: Transaction) => {
    // Custom descriptions based on type and existing description
    if (tx.description) {
      // If it's a contribution with a group reference
      if (tx.type === "contribution" && tx.description.includes("Contribution")) {
        return tx.description.replace("Contribution for", "Group contribution for");
      }
      // If it's a payout
      if (tx.type === "payout") {
        return tx.description.replace("Payout from", "Group payout from");
      }
      return tx.description;
    }
    
    // Default descriptions by type
    switch (tx.type) {
      case "funding":
        return "Wallet funding";
      case "payout":
        return "Group payout";
      case "contribution":
        return "Group contribution";
      case "withdrawal":
        return "Withdrawal to bank";
      case "lock":
        return "Locked savings";
      case "unlock":
        return "Unlocked savings";
      case "service_fee":
        return "Platform service fee";
      case "split_payment":
        return "SplitPay payment";
      default:
        return tx.type.replace("_", " ");
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
            

            {/* Action Buttons */}
            <div className="flex gap-3 max-w-xs mx-auto">
              <Button 
                className="flex-1 bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
                onClick={() => setFundDialogOpen(true)}
              >
                <ArrowDownLeft className="h-4 w-4 mr-2" />
                Fund
              </Button>
              <Button 
                className="flex-1 bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
                onClick={() => setWithdrawDialogOpen(true)}
              >
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Withdraw
              </Button>
            </div>
          </motion.div>
        </header>
      </div>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Virtual Account Card - Show if exists */}
        {profile?.flw_virtual_account_number && (
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
        )}


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
                      <p className="font-medium text-foreground text-sm">
                        {formatTransactionDescription(tx)}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(tx.created_at), "MMM d, h:mm a")}
                        </p>
                        {tx.status === "failed" && (
                          <span className="text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Failed</span>
                        )}
                        {tx.status === "pending" && (
                          <span className="text-[10px] font-medium text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">Pending</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`font-semibold ${
                      tx.type === "funding" || tx.type === "payout" 
                        ? "text-success" 
                        : "text-foreground"
                    }`}>
                      {tx.type === "funding" || tx.type === "payout" ? "+" : "-"}₦{formatAmount(tx.amount)}
                    </span>
                    {tx.type === "split_payment" && (
                      <p className="text-[10px] text-muted-foreground">incl. fee</p>
                    )}
                  </div>
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

      {/* Withdraw Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Funds</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-xl font-bold text-foreground">₦{formatAmount(balance)}</p>
            </div>
            
            {/* Saved Bank Details */}
            {profile?.bank_name && profile?.bank_account ? (
              <div className="p-3 rounded-lg bg-success/5 border border-success/20">
                <p className="text-sm text-muted-foreground">Saved Withdrawal Bank</p>
                <p className="font-medium text-foreground">{profile.bank_name}</p>
                <p className="text-sm text-muted-foreground">****{profile.bank_account.slice(-4)}</p>
              </div>
            ) : null}
            
            <button 
              onClick={() => {
                setWithdrawDialogOpen(false);
                setShowBankForm(true);
              }}
              className="w-full p-3 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">
                  {profile?.bank_name ? "Update Withdrawal Bank" : "Set Up Withdrawal Bank"}
                </p>
              </div>
            </button>

            <div className="space-y-2">
              <Label htmlFor="withdrawAmount">Amount to receive (₦)</Label>
              <Input
                id="withdrawAmount"
                type="number"
                placeholder="Enter amount"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                min={1000}
                max={balance - 100}
              />
              <p className="text-xs text-muted-foreground">Minimum: ₦1,000 • 2FA required</p>
            </div>

            {/* Fee breakdown */}
            {withdrawAmount && Number(withdrawAmount) >= 1000 && (
              <div className="p-3 rounded-lg bg-muted space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Withdrawal Amount</span>
                  <span className="text-foreground">₦{formatAmount(Number(withdrawAmount))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Transfer Fee</span>
                  <span className="text-foreground">₦100</span>
                </div>
                <div className="border-t border-border pt-1 flex justify-between text-sm font-semibold">
                  <span className="text-foreground">Total Deduction</span>
                  <span className="text-foreground">₦{formatAmount(Number(withdrawAmount) + 100)}</span>
                </div>
              </div>
            )}

            <Button 
              onClick={handleWithdraw} 
              disabled={withdrawing || !withdrawAmount || (Number(withdrawAmount) + 100) > balance}
              className="w-full"
            >
              {withdrawing ? (
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              ) : null}
              Proceed to Verify
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <WithdrawalBankForm
        open={showBankForm}
        onOpenChange={setShowBankForm}
      />

      <BottomNav />
    </div>
  );
}
