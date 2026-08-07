import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, CreditCard, RefreshCw, CheckCircle2, Building2,
  Smartphone, QrCode, Copy, Check, Banknote, ChevronRight, TestTube,
  ArrowDownLeft, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Props {
  loading: boolean;
  accountNumber: string;
  bankName?: string;
  fullName?: string;
  onFund: (amount: number) => Promise<boolean>;
  onBack: () => void;
}

type FundingChannel = "select" | "bank_transfer" | "card" | "ussd";

const presets = [1000, 5000, 10000, 25000, 50000, 100000];

const channels = [
  {
    id: "bank_transfer" as FundingChannel,
    label: "Bank Transfer",
    desc: "Transfer from any bank to your VFD account",
    icon: Building2,
    badge: null,
  },
  {
    id: "card" as FundingChannel,
    label: "Debit Card",
    desc: "Fund via Visa, Mastercard, or Verve",
    icon: CreditCard,
    badge: null,
  },
  {
    id: "ussd" as FundingChannel,
    label: "USSD",
    desc: "Fund using USSD banking code",
    icon: Smartphone,
    badge: null,
  },
];

export function SandboxFund({
  loading,
  accountNumber,
  bankName = "VFD Microfinance Bank",
  fullName = "Vestara User",
  onFund,
  onBack,
}: Props) {
  const [channel, setChannel] = useState<FundingChannel>("select");
  const [amount, setAmount] = useState("");
  const [funded, setFunded] = useState(false);
  const [funding, setFunding] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const canFund = parseFloat(amount) > 0;

  const handleFund = async () => {
    const amt = parseFloat(amount);
    if (funding || !canFund) return;
    setFunding(true);
    const ok = await onFund(amt).catch(() => false).finally(() => setFunding(false));
    if (!ok) return;
    setFunded(true);
    setTimeout(() => {
      setFunded(false);
      setAmount("");
    }, 2000);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const goBack = () => {
    if (channel !== "select") setChannel("select");
    else onBack();
  };

  return (
    <div className="space-y-5" aria-busy={loading || funding}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold">Fund Account</h2>
          <p className="text-xs text-muted-foreground">
            {channel === "select"
              ? "Choose how to add funds"
              : channels.find((c) => c.id === channel)?.label}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Channel Selection ── */}
        {channel === "select" && (
          <motion.div
            key="select"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-3"
          >
            {channels.map((ch) => {
              const Icon = ch.icon;
              return (
                <button
                  key={ch.id}
                  onClick={() => setChannel(ch.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border/50 bg-card hover:border-primary/40 hover:bg-accent/30 transition-all text-left group"
                >
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{ch.label}</span>
                      {ch.badge && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600">
                          {ch.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{ch.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              );
            })}
          </motion.div>
        )}

        {/* ── Bank Transfer ── */}
        {channel === "bank_transfer" && (
          <motion.div
            key="bank_transfer"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-card rounded-2xl border border-border/50 p-5 space-y-5"
          >
            <div className="text-center space-y-1">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Transfer to this account</p>
              <p className="text-xs text-muted-foreground">
                Send money from any bank app or internet banking
              </p>
            </div>

            <div className="space-y-3 bg-muted/30 rounded-xl p-4">
              {[
                { label: "Bank", value: bankName },
                { label: "Account Number", value: accountNumber, copy: true, mono: true },
                { label: "Account Name", value: fullName },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{row.label}</p>
                    <p className={`text-sm font-semibold ${row.mono ? "font-mono tracking-wider" : ""}`}>
                      {row.value}
                    </p>
                  </div>
                  {row.copy && (
                    <button
                      onClick={() => copyToClipboard(row.value, row.label)}
                      className="p-2 rounded-lg hover:bg-primary/10 transition-colors"
                    >
                      {copied === row.label ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 bg-amber-500/10 rounded-xl p-3">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Your wallet will be credited automatically once the transfer is confirmed. This typically takes 1–5 minutes.
              </p>
            </div>

            <Button onClick={goBack} variant="outline" className="w-full">
              <ArrowDownLeft className="h-4 w-4 mr-2" /> I've sent the money
            </Button>
          </motion.div>
        )}

        {/* ── Card Payment (VFD Payment Widget placeholder) ── */}
        {channel === "card" && (
          <motion.div
            key="card"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-card rounded-2xl border border-border/50 p-5 space-y-5"
          >
            <div className="text-center space-y-1">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Pay with Card</p>
              <p className="text-xs text-muted-foreground">
                Visa, Mastercard, or Verve debit card
              </p>
            </div>

            <AmountInput amount={amount} setAmount={setAmount} />
            <PresetGrid amount={amount} setAmount={setAmount} />

            <div className="flex items-start gap-2 bg-blue-500/10 rounded-xl p-3">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                In sandbox mode, this simulates VFD's Payment Widget card collection. In production, this launches the VFD secure payment page.
              </p>
            </div>

            <Button
              onClick={handleFund}
              disabled={funding || !canFund || funded}
              className="w-full h-12"
              variant={funded ? "success" : "hero"}
            >
              <FundButtonContent loading={funding} funded={funded} amount={amount} label="Pay with Card" />
            </Button>
          </motion.div>
        )}

        {/* ── USSD ── */}
        {channel === "ussd" && (
          <motion.div
            key="ussd"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-card rounded-2xl border border-border/50 p-5 space-y-5"
          >
            <div className="text-center space-y-1">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Smartphone className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium">USSD Transfer</p>
              <p className="text-xs text-muted-foreground">
                Dial from your phone to transfer instantly
              </p>
            </div>

            <div className="bg-muted/30 rounded-xl p-4 text-center space-y-2">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Dial this code</p>
              <p className="text-xl font-bold font-mono tracking-wider text-primary">
                *5573*8*{accountNumber}#
              </p>
              <button
                onClick={() => copyToClipboard(`*5573*8*${accountNumber}#`, "ussd")}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {copied === "ussd" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === "ussd" ? "Copied" : "Copy code"}
              </button>
            </div>

            <div className="flex items-start gap-2 bg-amber-500/10 rounded-xl p-3">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Dial the USSD code on your phone, enter the amount and PIN. Funds reflect within 1 minute.
              </p>
            </div>

            <Button onClick={goBack} variant="outline" className="w-full">
              Done
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Shared Sub-Components ── */

function AmountInput({ amount, setAmount }: { amount: string; setAmount: (v: string) => void }) {
  return (
    <Input
      type="number"
      value={amount}
      onChange={(e) => setAmount(e.target.value)}
      placeholder="₦ Enter amount"
      className="text-center text-xl font-bold h-14"
      min={1}
    />
  );
}

function PresetGrid({ amount, setAmount }: { amount: string; setAmount: (v: string) => void }) {
  return (
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
  );
}

function FundButtonContent({
  loading,
  funded,
  amount,
  label,
}: {
  loading: boolean;
  funded: boolean;
  amount: string;
  label: string;
}) {
  if (funded)
    return <><CheckCircle2 className="h-4 w-4 mr-2" /> Funded!</>;
  if (loading)
    return <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Processing...</>;

  const amt = parseFloat(amount);
  const formatted = !isNaN(amt) && amt > 0 ? ` ₦${amt.toLocaleString()}` : "";
  return (
    <>
      <Banknote className="h-4 w-4 mr-2" /> {label}{formatted}
    </>
  );
}
