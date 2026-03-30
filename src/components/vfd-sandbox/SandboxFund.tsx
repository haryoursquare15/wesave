import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CreditCard, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  loading: boolean;
  accountNumber: string;
  onFund: (amount: number) => Promise<void>;
  onBack: () => void;
}

const presets = [1000, 5000, 10000, 25000, 50000, 100000];

export function SandboxFund({ loading, accountNumber, onFund, onBack }: Props) {
  const [amount, setAmount] = useState("");
  const [funded, setFunded] = useState(false);

  const handleFund = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    await onFund(amt);
    setFunded(true);
    setTimeout(() => { setFunded(false); setAmount(""); }, 2000);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold">Fund Account</h2>
          <p className="text-xs text-muted-foreground">Add test funds to your sandbox wallet</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border/50 p-5 space-y-5"
      >
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Crediting to</p>
          <p className="text-lg font-semibold font-mono tracking-wider">{accountNumber}</p>
        </div>

        <div>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="₦ Enter amount"
            className="text-center text-xl font-bold h-16"
            min={1}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {presets.map((amt) => (
            <button
              key={amt}
              onClick={() => setAmount(amt.toString())}
              className={`py-2.5 rounded-xl text-xs font-medium border transition-all ${
                amount === amt.toString()
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 text-foreground border-border/50 hover:border-primary/30"
              }`}
            >
              ₦{amt.toLocaleString()}
            </button>
          ))}
        </div>

        <Button
          onClick={handleFund}
          disabled={loading || !amount || funded}
          className="w-full h-12"
          variant={funded ? "success" : "hero"}
        >
          {funded ? (
            <><CheckCircle2 className="h-4 w-4 mr-2" /> Funded!</>
          ) : loading ? (
            <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Processing...</>
          ) : (
            <><CreditCard className="h-4 w-4 mr-2" /> Fund Account</>
          )}
        </Button>
      </motion.div>
    </div>
  );
}
