import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Banknote, Building2, Check, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TransactionPinGate } from "@/components/security/TransactionPinGate";
import { TransactionSuccessModal } from "@/components/feedback/TransactionSuccessModal";
import { useToast } from "@/hooks/use-toast";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { cn } from "@/lib/utils";

interface WithdrawalBank {
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  set_at: string;
}

interface SandboxWithdrawProps {
  userId: string;
  accountNumber: string;
  availableBalance: number;
  onWithdraw: (params: {
    fromAccount: string; toAccount: string; bankCode: string;
    amount: number; narration: string; beneficiaryName: string;
  }) => Promise<unknown>;
  onBack: () => void;
  onSetupBank: () => void;
}

const MIN_AMOUNT = 1000;
const WITHDRAWAL_FEE = 100;

export function SandboxWithdraw({
  userId, accountNumber, availableBalance, onWithdraw, onBack, onSetupBank,
}: SandboxWithdrawProps) {
  const { toast } = useToast();
  const [bank, setBank] = useState<WithdrawalBank | null>(null);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [amount, setAmount] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successPayload, setSuccessPayload] = useState<{
    title: string; description: string;
    details: Array<{ label: string; value: string; highlight?: boolean }>;
    reference?: string; primaryLabel?: string;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    void sandboxSupabase.from("vfd_sandbox_clients").select("metadata").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        const wb = (data?.metadata as Record<string, unknown> | null)?.withdrawal_bank as WithdrawalBank | undefined;
        if (wb?.account_number && wb?.bank_name) setBank(wb);
        setBankLoaded(true);
      });
  }, [userId]);

  const numericAmount = parseFloat(amount) || 0;
  const totalDebit = numericAmount > 0 ? numericAmount + WITHDRAWAL_FEE : 0;
  const canSubmit =
    !!bank && numericAmount >= MIN_AMOUNT && totalDebit <= availableBalance;

  const maskAccount = (acct: string) =>
    acct.length >= 4 ? `${"•".repeat(Math.max(0, acct.length - 4))}${acct.slice(-4)}` : acct;

  const executeWithdrawal = async () => {
    if (!bank) return;
    setSubmitting(true);
    let result: unknown = null;
    try {
      result = await onWithdraw({
        fromAccount: accountNumber,
        toAccount: bank.account_number,
        bankCode: bank.bank_code,
        amount: numericAmount,
        narration: "Vestara Withdrawal",
        beneficiaryName: bank.account_name,
      });
    } finally {
      setSubmitting(false);
    }
    const transferResult = result as {
      reference?: string;
      transactionId?: string;
      vfd_reference?: string;
      session_id?: string;
      data?: { status?: string; txnId?: string; reference?: string; sessionId?: string; message?: string };
    } | null;
    if (transferResult?.data?.status === "00") {
      const ref = transferResult.reference
        || transferResult.data?.reference
        || transferResult.data?.txnId
        || transferResult.transactionId;
      const vfdRef = transferResult.vfd_reference || transferResult.data?.reference || null;
      const sessionId = transferResult.session_id || transferResult.data?.sessionId || null;
      setSuccessPayload({
        title: "Withdrawal Successful",
        description: `₦${numericAmount.toLocaleString()} is on its way to your ${bank.bank_name} account.`,
        details: [
          { label: "Amount", value: `₦${numericAmount.toLocaleString()}`, highlight: true },
          { label: "Recipient", value: bank.account_name },
          { label: "Bank", value: bank.bank_name },
          { label: "Account", value: maskAccount(bank.account_number) },
          { label: "Date", value: new Date().toLocaleString("en-NG") },
          ...(vfdRef ? [{ label: "Bank reference", value: vfdRef }] : []),
          ...(sessionId ? [{ label: "NIBSS session", value: sessionId }] : []),
        ],
        reference: ref,
        primaryLabel: "Done",
      });
      setAmount("");
    } else if (transferResult?.data?.message) {
      toast({ title: "Withdrawal failed", description: transferResult.data.message, variant: "destructive" as never });
    }
  };

  /* ── No withdrawal bank saved yet ── */
  if (bankLoaded && !bank) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-base font-semibold">Withdraw</h2>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">No withdrawal bank set</p>
            <p className="text-xs text-muted-foreground">
              Set up your withdrawal bank once — every withdrawal goes straight to that account.
            </p>
          </div>
          <Button size="sm" onClick={onSetupBank}>Set Up Withdrawal Bank</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-base font-semibold">Withdraw</h2>
      </div>

      {/* Saved bank — fixed destination */}
      {bank && (
        <div className="bg-card rounded-2xl border border-border/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{bank.bank_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {bank.account_name} · {maskAccount(bank.account_number)}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success shrink-0">
              <Check className="h-3 w-3" /> Verified
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            Withdrawals always go to your saved account. Change it in Profile.
          </p>
        </div>
      )}

      {/* Amount */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border/50 p-4 space-y-4"
      >
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Amount to withdraw</Label>
          <span className="text-xs text-muted-foreground">
            Available: <span className="font-semibold text-success">₦{availableBalance.toLocaleString()}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <span className="text-2xl font-bold text-foreground">₦</span>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="0"
            inputMode="numeric"
            className="border-0 p-0 h-10 text-2xl font-bold bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[1000, 5000, 10000, 20000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                numericAmount === v
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              ₦{v.toLocaleString()}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const max = Math.floor((availableBalance - WITHDRAWAL_FEE) / 100) * 100;
              if (max >= MIN_AMOUNT) setAmount(String(max));
            }}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-border text-muted-foreground hover:border-primary/40 transition-colors"
          >
            Max
          </button>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Bank transfer fee</span>
          <span className="font-medium text-foreground">₦{WITHDRAWAL_FEE.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm font-semibold">
          <span className="text-foreground">Total debited</span>
          <span className="text-foreground tabular-nums">
            ₦{totalDebit > 0 ? totalDebit.toLocaleString() : "0"}
          </span>
        </div>
        {numericAmount > 0 && numericAmount < MIN_AMOUNT && (
          <p className="text-xs text-destructive">Minimum withdrawal is ₦{MIN_AMOUNT.toLocaleString()}.</p>
        )}
        {totalDebit > availableBalance && (
          <p className="text-xs text-destructive">
            Not enough balance — you need ₦{totalDebit.toLocaleString()} including the fee.
          </p>
        )}
      </motion.div>

      <Button
        variant="hero"
        className="w-full h-12"
        disabled={!canSubmit || submitting}
        onClick={() => setPinOpen(true)}
      >
        <Banknote className="h-4 w-4 mr-2" />
        Withdraw to {bank ? bank.bank_name : "Bank"}
      </Button>

      <TransactionPinGate
        open={pinOpen}
        onOpenChange={setPinOpen}
        purpose="Withdrawal"
        description={`Withdraw ₦${numericAmount.toLocaleString()} to ${bank?.account_name || "your bank account"} (${bank?.bank_name || ""})`}
        onVerified={executeWithdrawal}
      />

      <TransactionSuccessModal
        open={!!successPayload}
        onOpenChange={(o) => { if (!o) setSuccessPayload(null); }}
        payload={successPayload}
      />
    </div>
  );
}
