import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, Lock, Users,
  RefreshCw, CreditCard, Receipt, Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  description: string | null;
  reference: string | null;
  vfd_reference?: string | null;
  session_id?: string | null;
  status: string;
  created_at: string;
}

interface Props {
  transactions: Transaction[];
  loading: boolean;
  onRefresh: () => void;
  onBack: () => void;
}

function getTxIcon(type: string) {
  switch (type) {
    case "credit": return { icon: ArrowDownLeft, bg: "bg-success/10", color: "text-success" };
    case "debit": return { icon: ArrowUpRight, bg: "bg-destructive/10", color: "text-destructive" };
    case "lock": return { icon: Lock, bg: "bg-warning/10", color: "text-warning" };
    case "unlock": return { icon: ArrowDownLeft, bg: "bg-success/10", color: "text-success" };
    case "savings": return { icon: Users, bg: "bg-primary/10", color: "text-primary" };
    default: return { icon: CreditCard, bg: "bg-muted", color: "text-muted-foreground" };
  }
}


function getStatusStyle(status: string) {
  switch (status) {
    case "completed": return "bg-success/10 text-success border-success/20";
    case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
    default: return "bg-warning/10 text-warning border-warning/20";
  }
}

export function SandboxTransactions({ transactions, loading, onRefresh, onBack }: Props) {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = async (label: string, value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      toast({ title: `${label} copied`, description: value });
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold">Transactions</h2>
          <p className="text-xs text-muted-foreground">{transactions.length} transaction(s)</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && transactions.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : transactions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-card rounded-2xl border border-border/50 p-10 text-center"
        >
          <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-muted-foreground">No transactions yet</p>
          <p className="text-xs text-muted-foreground mt-1">Fund your account to get started</p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx, i) => {
            const { icon: Icon, bg, color } = getTxIcon(tx.transaction_type);
            const isCredit = tx.transaction_type === "credit" || tx.transaction_type === "unlock" || tx.transaction_type === "interest";
            const displayLabel = getTxLabel(tx);

            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card rounded-xl border border-border/50 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{displayLabel}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {tx.description || tx.reference || "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${isCredit ? "text-success" : "text-destructive"}`}>
                      {isCredit ? "+" : "-"}₦{tx.amount.toLocaleString()}
                    </p>
                    <Badge variant="outline" className={`text-[9px] ${getStatusStyle(tx.status)}`}>
                      {tx.status}
                    </Badge>
                  </div>
                </div>

                {(tx.vfd_reference || tx.session_id) && (
                  <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                    {tx.vfd_reference && (
                      <button
                        type="button"
                        onClick={() => copy("VFD reference", tx.vfd_reference!, `${tx.id}-ref`)}
                        className="w-full flex items-center justify-between gap-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span className="shrink-0">VFD ref</span>
                        <span className="font-mono truncate flex-1 text-right">{tx.vfd_reference}</span>
                        {copiedKey === `${tx.id}-ref`
                          ? <Check className="h-3 w-3 text-success shrink-0" />
                          : <Copy className="h-3 w-3 shrink-0 opacity-60" />}
                      </button>
                    )}
                    {tx.session_id && (
                      <button
                        type="button"
                        onClick={() => copy("NIBSS session ID", tx.session_id!, `${tx.id}-sid`)}
                        className="w-full flex items-center justify-between gap-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span className="shrink-0">NIBSS session</span>
                        <span className="font-mono truncate flex-1 text-right">{tx.session_id}</span>
                        {copiedKey === `${tx.id}-sid`
                          ? <Check className="h-3 w-3 text-success shrink-0" />
                          : <Copy className="h-3 w-3 shrink-0 opacity-60" />}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
