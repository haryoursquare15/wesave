import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Send, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Props {
  loading: boolean;
  accountNumber: string;
  banks: Array<{ code: string; name: string }>;
  onLoadBanks: () => Promise<void>;
  onValidate: (account: string, bankCode: string) => Promise<string | null>;
  onTransfer: (params: {
    fromAccount: string; toAccount: string; bankCode: string;
    amount: number; narration: string; beneficiaryName: string;
  }) => Promise<unknown>;
  onBack: () => void;
}

export function SandboxTransfer({ loading, accountNumber, banks, onLoadBanks, onValidate, onTransfer, onBack }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    toAccount: "", bankCode: "", amount: "", narration: "", beneficiaryName: "",
  });

  const handleValidate = async () => {
    const name = await onValidate(form.toAccount, form.bankCode);
    if (name) {
      setForm(p => ({ ...p, beneficiaryName: name }));
      toast({ title: "Account verified", description: name });
    }
  };

  const handleTransfer = async () => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return;
    const result = await onTransfer({
      fromAccount: accountNumber, toAccount: form.toAccount,
      bankCode: form.bankCode, amount,
      narration: form.narration || "Sandbox Transfer",
      beneficiaryName: form.beneficiaryName,
    });
    if (result) {
      setForm({ toAccount: "", bankCode: "", amount: "", narration: "", beneficiaryName: "" });
      toast({ title: "Transfer initiated!" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold">Transfer Funds</h2>
          <p className="text-xs text-muted-foreground">Send to another bank account</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border/50 p-5 space-y-4"
      >
        {banks.length === 0 && (
          <Button variant="outline" onClick={onLoadBanks} disabled={loading} className="w-full">
            Load Bank List
          </Button>
        )}

        <div>
          <Label className="text-xs text-muted-foreground">Bank</Label>
          <Select value={form.bankCode} onValueChange={(v) => setForm(p => ({ ...p, bankCode: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select bank" /></SelectTrigger>
            <SelectContent>
              {banks.map((b) => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Account Number</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={form.toAccount}
              onChange={(e) => setForm(p => ({ ...p, toAccount: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
              placeholder="10-digit account"
              maxLength={10}
            />
            <Button variant="outline" onClick={handleValidate}
              disabled={form.toAccount.length !== 10 || !form.bankCode || loading} size="sm">
              Verify
            </Button>
          </div>
          {form.beneficiaryName && (
            <p className="text-xs text-success mt-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> {form.beneficiaryName}
            </p>
          )}
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Amount (₦)</Label>
          <Input type="number" value={form.amount}
            onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
            placeholder="Enter amount" className="mt-1" />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Narration</Label>
          <Input value={form.narration}
            onChange={(e) => setForm(p => ({ ...p, narration: e.target.value }))}
            placeholder="Transfer description" className="mt-1" />
        </div>

        <Button onClick={handleTransfer}
          disabled={loading || !form.toAccount || !form.bankCode || !form.amount}
          className="w-full h-12" variant="hero">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Send Transfer
        </Button>
      </motion.div>
    </div>
  );
}
