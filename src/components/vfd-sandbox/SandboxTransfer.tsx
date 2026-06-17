import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Send, RefreshCw, CheckCircle2, Search, X, Users, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { TransactionPinGate } from "@/components/security/TransactionPinGate";
import { TransactionSuccessModal, TransactionSuccessPayload } from "@/components/feedback/TransactionSuccessModal";
import { TransferPreviewSheet } from "@/components/vfd-sandbox/TransferPreviewSheet";
import { useVfdBanking } from "@/hooks/useVfdBanking";

interface Beneficiary {
  id: string;
  alias: string;
  account_number: string;
  bank_code: string;
  bank_name: string;
  beneficiary_name: string;
}

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
  const { listTransferBeneficiaries, saveTransferBeneficiary, deleteTransferBeneficiary } = useVfdBanking();
  const [form, setForm] = useState({
    toAccount: "", bankCode: "", amount: "", narration: "", beneficiaryName: "",
  });
  const [pinOpen, setPinOpen] = useState(false);
  const [successPayload, setSuccessPayload] = useState<TransactionSuccessPayload | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [bankPopoverOpen, setBankPopoverOpen] = useState(false);

  // Beneficiaries
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [shouldSaveBenef, setShouldSaveBenef] = useState(true);
  const [savedAlias, setSavedAlias] = useState("");

  const loadBeneficiaries = async () => {
    const r = await listTransferBeneficiaries();
    if (r?.data) setBeneficiaries(r.data as Beneficiary[]);
  };

  useEffect(() => {
    loadBeneficiaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load banks once on mount so the dropdown is ready immediately
  useEffect(() => {
    if (banks.length === 0) onLoadBanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredBanks = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter(b => b.name.toLowerCase().includes(q) || b.code.includes(q));
  }, [banks, bankSearch]);

  const selectedBankName = banks.find(b => b.code === form.bankCode)?.name || "";

  const lastVerifiedRef = useRef<string>("");
  const [verifying, setVerifying] = useState(false);

  const runVerify = async (account: string, bankCode: string) => {
    const key = `${bankCode}:${account}`;
    if (lastVerifiedRef.current === key) return;
    lastVerifiedRef.current = key;
    setVerifying(true);
    try {
      const name = await onValidate(account, bankCode);
      if (name) {
        setForm(p => ({ ...p, beneficiaryName: name }));
      } else {
        setForm(p => ({ ...p, beneficiaryName: "" }));
        lastVerifiedRef.current = "";
      }
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (form.toAccount.length !== 10 || !form.bankCode) return;
    const t = setTimeout(() => { runVerify(form.toAccount, form.bankCode); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.toAccount, form.bankCode]);

  const pickBeneficiary = (b: Beneficiary) => {
    setForm({
      toAccount: b.account_number,
      bankCode: b.bank_code,
      amount: "",
      narration: "",
      beneficiaryName: b.beneficiary_name,
    });
    lastVerifiedRef.current = `${b.bank_code}:${b.account_number}`;
    toast({ title: "Beneficiary selected", description: `${b.alias} • ${b.bank_name}` });
  };

  const removeBeneficiary = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remove this beneficiary?")) return;
    await deleteTransferBeneficiary(id);
    setBeneficiaries(prev => prev.filter(b => b.id !== id));
    toast({ title: "Beneficiary removed" });
  };

  const handleTransferRequest = () => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return;
    // Default alias = recipient name
    setSavedAlias(form.beneficiaryName || "");
    // Pre-check: if already saved, hide the save prompt
    const exists = beneficiaries.some(b => b.bank_code === form.bankCode && b.account_number === form.toAccount);
    setShouldSaveBenef(!exists);
    setPinOpen(true);
  };

  const executeTransfer = async () => {
    const amount = parseFloat(form.amount);
    const bankName = banks.find(b => b.code === form.bankCode)?.name || form.bankCode;
    const result = await onTransfer({
      fromAccount: accountNumber, toAccount: form.toAccount,
      bankCode: form.bankCode, amount,
      narration: form.narration || "Sandbox Transfer",
      beneficiaryName: form.beneficiaryName,
    });
    const transferResult = result as {
      reference?: string;
      transactionId?: string;
      data?: { status?: string; txnId?: string; reference?: string; message?: string };
    } | null;
    if (transferResult?.data?.status === "00") {
      const ref = transferResult.reference
        || transferResult.data?.reference
        || transferResult.data?.txnId
        || transferResult.transactionId;
      if (!ref) return;
      setSuccessPayload({
        title: "Transfer Successful",
        description: `Your transfer of ₦${amount.toLocaleString()} has been sent.`,
        details: [
          { label: "Amount", value: `₦${amount.toLocaleString()}`, highlight: true },
          { label: "Fee", value: "₦0.00" },
          { label: "Recipient", value: form.beneficiaryName || form.toAccount },
          { label: "Bank", value: bankName },
          { label: "Account", value: form.toAccount },
          ...(form.narration ? [{ label: "Narration", value: form.narration }] : []),
          { label: "Date", value: new Date().toLocaleString("en-NG") },
        ],
        reference: ref,
        primaryLabel: "Done",
      });
      // Don't clear form yet — save prompt needs the values
    }
  };

  const handleSuccessClose = async () => {
    if (shouldSaveBenef && form.toAccount && form.bankCode && form.beneficiaryName) {
      const bankName = banks.find(b => b.code === form.bankCode)?.name || form.bankCode;
      const r = await saveTransferBeneficiary({
        alias: savedAlias.trim() || form.beneficiaryName,
        account_number: form.toAccount,
        bank_code: form.bankCode,
        bank_name: bankName,
        beneficiary_name: form.beneficiaryName,
      });
      if (r?.data) {
        toast({ title: "Beneficiary saved", description: "Available next time you transfer." });
        loadBeneficiaries();
      }
    }
    setForm({ toAccount: "", bankCode: "", amount: "", narration: "", beneficiaryName: "" });
    setSuccessPayload(null);
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

      {/* Saved beneficiaries */}
      {beneficiaries.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2 px-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">Saved beneficiaries · tap to fill</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {beneficiaries.map(b => {
              const active = b.account_number === form.toAccount && b.bank_code === form.bankCode;
              return (
                <button
                  key={b.id}
                  onClick={() => pickBeneficiary(b)}
                  className={`group relative shrink-0 snap-start min-w-[140px] max-w-[180px] text-left rounded-2xl border p-3 transition-colors ${
                    active ? "border-primary bg-primary/5" : "border-border/50 bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {b.alias.slice(0, 2).toUpperCase()}
                    </div>
                    <button
                      onClick={(e) => removeBeneficiary(b.id, e)}
                      className="p-1 -mr-1 -mt-1 text-muted-foreground hover:text-destructive"
                      aria-label="Remove beneficiary"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold mt-2 truncate">{b.alias}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{b.bank_name}</p>
                  <p className="text-[11px] text-muted-foreground">{b.account_number}</p>
                </button>
              );
            })}
          </div>
        </motion.div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-3 flex items-center gap-2.5">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            No saved beneficiaries yet. After your next transfer you'll be asked to save the recipient for one-tap reuse.
          </p>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border/50 p-5 space-y-4"
      >
        {/* Bank picker with inline search */}
        <div>
          <Label className="text-xs text-muted-foreground">Bank</Label>
          <Popover open={bankPopoverOpen} onOpenChange={setBankPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={bankPopoverOpen}
                disabled={banks.length === 0}
                className="w-full mt-1 justify-between font-normal h-10"
              >
                <span className={selectedBankName ? "" : "text-muted-foreground"}>
                  {banks.length === 0 ? "Loading banks…" : (selectedBankName || "Select bank")}
                </span>
                <Search className="h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
              <div className="relative border-b">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Search bank by name or code"
                  className="w-full pl-9 pr-8 py-2.5 text-sm bg-transparent border-0 outline-none"
                />
                {bankSearch && (
                  <button
                    onClick={() => setBankSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {filteredBanks.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No banks match "{bankSearch}"</p>
                ) : (
                  filteredBanks.map(b => (
                    <button
                      key={b.code}
                      onClick={() => {
                        setForm(p => ({ ...p, bankCode: b.code, beneficiaryName: "" }));
                        lastVerifiedRef.current = "";
                        setBankPopoverOpen(false);
                        setBankSearch("");
                      }}
                      className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors ${
                        form.bankCode === b.code ? "bg-primary/5 text-primary font-medium" : ""
                      }`}
                    >
                      {b.name}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Account Number</Label>
          <div className="relative mt-1">
            <Input
              value={form.toAccount}
              onChange={(e) => setForm(p => ({ ...p, toAccount: e.target.value.replace(/\D/g, "").slice(0, 10), beneficiaryName: "" }))}
              placeholder="10-digit account"
              maxLength={10}
              inputMode="numeric"
            />
            {verifying && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {form.beneficiaryName ? (
            <p className="text-xs text-success mt-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> {form.beneficiaryName}
            </p>
          ) : form.toAccount.length === 10 && form.bankCode && !verifying ? (
            <p className="text-xs text-muted-foreground mt-1.5">Verifying…</p>
          ) : null}
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Amount (₦)</Label>
          <Input type="number" value={form.amount}
            onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
            placeholder="Enter amount" className="mt-1" inputMode="decimal" />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Narration</Label>
          <Input value={form.narration}
            onChange={(e) => setForm(p => ({ ...p, narration: e.target.value }))}
            placeholder="Transfer description" className="mt-1" />
        </div>

        <Button onClick={handleTransferRequest}
          disabled={loading || !form.toAccount || !form.bankCode || !form.amount || !form.beneficiaryName}
          className="w-full h-12" variant="hero">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Send Transfer
        </Button>
      </motion.div>

      <TransactionPinGate
        open={pinOpen}
        onOpenChange={setPinOpen}
        purpose="Bank Transfer"
        description={`Send ₦${(parseFloat(form.amount) || 0).toLocaleString()} to ${form.beneficiaryName || form.toAccount}`}
        onVerified={executeTransfer}
      />

      <TransactionSuccessModal
        open={!!successPayload}
        onOpenChange={(o) => { if (!o) handleSuccessClose(); }}
        payload={successPayload}
        extraContent={
          shouldSaveBenef && form.beneficiaryName ? (
            <div className="rounded-2xl border border-border/50 bg-muted/30 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={shouldSaveBenef}
                  onCheckedChange={(c) => setShouldSaveBenef(c === true)}
                />
                <span className="text-sm font-medium">Save as beneficiary</span>
              </label>
              {shouldSaveBenef && (
                <Input
                  value={savedAlias}
                  onChange={(e) => setSavedAlias(e.target.value)}
                  placeholder="Nickname (e.g. Mum, Landlord)"
                  className="h-9 text-sm"
                  maxLength={40}
                />
              )}
            </div>
          ) : null
        }
      />
    </div>
  );
}
