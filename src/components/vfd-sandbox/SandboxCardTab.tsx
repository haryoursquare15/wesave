import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, Eye, EyeOff, Lock, Unlock, KeyRound, ShieldCheck,
  Loader2, Copy, Check, AlertTriangle, Sparkles, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import wesaveLogo from "@/assets/wesave-logo-new.png";

interface VirtualCard {
  card_id: string;
  masked_pan: string;
  full_pan?: string;
  cvv?: string;
  expiry_date: string;
  status: string;
  created_at: string;
  activated_at?: string;
  blocked_at?: string;
  issuance_fee: number;
}

type CardView = "overview" | "create" | "details" | "pin-change";

const ISSUANCE_FEE = 1000;

/* ─── Format expiry ─── */
function formatExpiry(raw: string) {
  if (!raw || raw.length < 4) return raw || "••/••";
  // VFD returns e.g. "1204" = Dec 2004 → "12/04"
  return `${raw.slice(0, 2)}/${raw.slice(2)}`;
}

/* ─── Format PAN for display ─── */
function formatPan(pan: string, revealed: boolean) {
  if (!pan) return "•••• •••• •••• ••••";
  if (revealed && pan.length >= 16) {
    return pan.replace(/(.{4})/g, "$1 ").trim();
  }
  // masked_pan like "506124******6131"
  const clean = pan.replace(/\*/g, "•");
  if (clean.length >= 16) {
    return clean.replace(/(.{4})/g, "$1 ").trim();
  }
  return clean;
}

/* ═══ VIRTUAL CARD VISUAL ═══ */
function CardVisual({
  card,
  revealed,
  onToggleReveal,
}: {
  card: VirtualCard;
  revealed: boolean;
  onToggleReveal: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyPan = () => {
    if (card.full_pan) {
      navigator.clipboard.writeText(card.full_pan);
      setCopied(true);
      toast({ title: "Copied", description: "Card number copied" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isActive = card.status === "active";
  const isBlocked = card.status === "blocked";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, rotateY: -5 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative w-full aspect-[1.586/1] max-w-[360px] mx-auto"
      style={{ perspective: "1000px" }}
    >
      <div
        className={`absolute inset-0 rounded-2xl shadow-2xl overflow-hidden ${
          isBlocked
            ? "bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900"
            : "bg-gradient-to-br from-primary via-primary/90 to-emerald-800"
        }`}
      >
        {/* Holographic overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.07] to-transparent pointer-events-none" />
        <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-white/[0.05]" />
        <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-white/[0.04]" />

        {/* Card chip */}
        <div className="absolute top-6 left-6">
          <div className="w-10 h-7 rounded-md bg-gradient-to-br from-amber-300/80 to-amber-500/60 border border-amber-400/30 flex items-center justify-center">
            <div className="w-6 h-4 rounded-sm border border-amber-600/30 bg-amber-400/20" />
          </div>
        </div>

        {/* WeSave Logo - top right */}
        <div className="absolute top-5 right-5">
          <img src={wesaveLogo} alt="WeSave" className="h-6 opacity-90 brightness-200" />
        </div>

        {/* Status badge */}
        {isBlocked && (
          <div className="absolute top-6 left-20">
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0.5">
              BLOCKED
            </Badge>
          </div>
        )}

        {/* Card Number */}
        <div className="absolute bottom-[52px] left-6 right-6">
          <div className="flex items-center gap-2">
            <button onClick={copyPan} className="flex-1 text-left">
              <p className="text-[15px] font-mono tracking-[0.18em] text-white/90 select-none">
                {formatPan(revealed && card.full_pan ? card.full_pan : card.masked_pan, revealed)}
              </p>
            </button>
            <div className="flex gap-1">
              {revealed && card.full_pan && (
                <button onClick={copyPan} className="p-1 hover:bg-white/10 rounded-md transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-300" /> : <Copy className="h-3.5 w-3.5 text-white/50" />}
                </button>
              )}
              <button
                onClick={onToggleReveal}
                className="p-1 hover:bg-white/10 rounded-md transition-colors"
              >
                {revealed ? <EyeOff className="h-3.5 w-3.5 text-white/50" /> : <Eye className="h-3.5 w-3.5 text-white/50" />}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom row: Expiry + CVV + VFD */}
        <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
          <div className="flex gap-6">
            <div>
              <p className="text-[8px] uppercase text-white/40 tracking-widest mb-0.5">Expires</p>
              <p className="text-xs font-mono text-white/80">{formatExpiry(card.expiry_date)}</p>
            </div>
            <div>
              <p className="text-[8px] uppercase text-white/40 tracking-widest mb-0.5">CVV</p>
              <p className="text-xs font-mono text-white/80">{revealed && card.cvv ? card.cvv : "•••"}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8px] text-white/30 tracking-wide">Powered by</p>
            <p className="text-[10px] font-bold text-white/50 tracking-wider">VFD MFB</p>
          </div>
        </div>

        {/* Contactless icon */}
        <div className="absolute top-[52px] left-6">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white/30">
            <path d="M7 15.5C7.5 14 8.5 12.5 10 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M5 18C6 15.5 8 13 11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M3 20.5C4.5 17 7.5 13.5 12 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══ MAIN COMPONENT ═══ */
export function SandboxCardTab() {
  const { toast } = useToast();
  const sandbox = useVfdSandboxProducts();
  const [view, setView] = useState<CardView>("overview");
  const [cards, setCards] = useState<VirtualCard[]>([]);
  const [activeCard, setActiveCard] = useState<VirtualCard | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [defaultPin, setDefaultPin] = useState<string | null>(null);
  const [needsKyc, setNeedsKyc] = useState(false);

  // Pin change state
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const loadCards = useCallback(async () => {
    setLoading(true);
    const result = await sandbox.invoke("get_cards");
    if (result?.data) {
      setCards(result.data as VirtualCard[]);
      if (result.data.length > 0 && !activeCard) {
        setActiveCard(result.data[0] as VirtualCard);
      }
    }
    setLoading(false);
  }, [sandbox, activeCard]);

  useEffect(() => {
    loadCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateCard = async () => {
    setLoading(true);
    setNeedsKyc(false);
    const result = await sandbox.invoke("create_virtual_card");
    if (result === null) {
      // Check if error was KYC-related (toast already shown by hook)
      setNeedsKyc(true);
      setLoading(false);
      return;
    }
    if (result?.data) {
      toast({ title: "Card Created!", description: `₦${ISSUANCE_FEE.toLocaleString()} issuance fee charged` });
      await loadCards();
      setView("overview");
    }
    setLoading(false);
  };

  const handleActivate = async () => {
    if (!activeCard) return;
    setLoading(true);
    const result = await sandbox.invoke("activate_card", { card_id: activeCard.card_id });
    if (result?.data) {
      setDefaultPin(result.data.default_pin || "1234");
      toast({ title: "Card Activated!", description: "Change your default PIN now" });
      await loadCards();
      // Refresh active card
      const detailResult = await sandbox.invoke("get_card_details", { card_id: activeCard.card_id });
      if (detailResult?.data) setActiveCard(detailResult.data as VirtualCard);
    }
    setLoading(false);
  };

  const handlePinChange = async () => {
    if (newPin !== confirmPin) {
      toast({ title: "PINs don't match", variant: "destructive" });
      return;
    }
    if (!activeCard) return;
    setLoading(true);
    const result = await sandbox.invoke("card_pin_change", {
      card_id: activeCard.card_id, old_pin: oldPin, new_pin: newPin,
    });
    if (result?.data) {
      toast({ title: "PIN Changed!", description: "Your new PIN is set" });
      setOldPin(""); setNewPin(""); setConfirmPin("");
      setDefaultPin(null);
      setView("overview");
    }
    setLoading(false);
  };

  const handleBlock = async () => {
    if (!activeCard) return;
    setLoading(true);
    const result = await sandbox.invoke("block_card", { card_id: activeCard.card_id });
    if (result?.data) {
      toast({ title: "Card Blocked", description: "Your card has been frozen" });
      await loadCards();
      setActiveCard((prev) => prev ? { ...prev, status: "blocked" } : null);
    }
    setLoading(false);
  };

  const handleUnblock = async () => {
    if (!activeCard) return;
    setLoading(true);
    const result = await sandbox.invoke("unblock_card", { card_id: activeCard.card_id });
    if (result?.data) {
      toast({ title: "Card Unblocked", description: "Your card is active again" });
      await loadCards();
      setActiveCard((prev) => prev ? { ...prev, status: "active" } : null);
    }
    setLoading(false);
  };

  const revealDetails = async () => {
    if (!activeCard) return;
    if (revealed) { setRevealed(false); return; }
    const result = await sandbox.invoke("get_card_details", { card_id: activeCard.card_id });
    if (result?.data) {
      setActiveCard(result.data as VirtualCard);
      setRevealed(true);
      // Auto-hide after 30s
      setTimeout(() => setRevealed(false), 30000);
    }
  };

  const hasCards = cards.length > 0;

  /* ─── CREATE VIEW ─── */
  if (view === "create" || (!hasCards && !loading)) {
    return (
      <div className="space-y-5">
        {hasCards && (
          <Button variant="ghost" size="icon" onClick={() => setView("overview")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3 pt-4"
        >
          {/* Stylized card preview */}
          <div className="relative w-56 aspect-[1.586/1] mx-auto rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-emerald-800 shadow-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.07] to-transparent" />
            <div className="absolute top-4 left-4">
              <div className="w-8 h-5 rounded bg-gradient-to-br from-amber-300/80 to-amber-500/60" />
            </div>
            <div className="absolute top-3 right-4">
              <img src={wesaveLogo} alt="WeSave" className="h-4 brightness-200 opacity-80" />
            </div>
            <div className="absolute bottom-8 left-4">
              <p className="text-[10px] font-mono text-white/50 tracking-[0.15em]">•••• •••• •••• ••••</p>
            </div>
            <div className="absolute bottom-3 right-4">
              <p className="text-[7px] text-white/30">VFD MFB</p>
            </div>
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            />
          </div>

          <h2 className="text-xl font-bold text-foreground pt-2">Get Your Virtual Card</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Create a Verve virtual debit card to make online payments instantly
          </p>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-2.5"
        >
          {[
            { icon: CreditCard, text: "Verve virtual debit card", sub: "Works on all Nigerian platforms" },
            { icon: ShieldCheck, text: "Secure & instant", sub: "Block or unblock anytime" },
            { icon: KeyRound, text: "Personal PIN", sub: "Set your own 4-digit PIN" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-card rounded-xl border border-border/50 p-3.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{f.text}</p>
                <p className="text-[11px] text-muted-foreground">{f.sub}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Issuance fee */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-warning/5 border border-warning/20 rounded-xl p-4"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-warning">Card Issuance Fee</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                A one-time fee of <strong className="text-foreground">₦{ISSUANCE_FEE.toLocaleString()}</strong> will be deducted from your available balance.
              </p>
            </div>
          </div>
        </motion.div>

        {needsKyc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-destructive/5 border border-destructive/20 rounded-xl p-4"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-destructive">KYC Required</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Please complete your KYC onboarding first. Go to the <strong className="text-foreground">KYC / Account</strong> tab to create your banking profile before requesting a virtual card.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        <Button
          className="w-full h-12 text-base font-bold"
          onClick={handleCreateCard}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
          Create Virtual Card — ₦{ISSUANCE_FEE.toLocaleString()}
        </Button>
      </div>
    );
  }

  /* ─── PIN CHANGE VIEW ─── */
  if (view === "pin-change") {
    return (
      <div className="space-y-5">
        <Button variant="ghost" size="icon" onClick={() => { setView("overview"); setDefaultPin(null); }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <KeyRound className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold">Change Card PIN</h2>
          <p className="text-sm text-muted-foreground">Set a new 4-digit PIN for your card</p>
        </div>

        {defaultPin && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground">Your default PIN is</p>
            <p className="text-2xl font-mono font-bold text-primary mt-1">{defaultPin}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Use this as your old PIN below</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Current PIN</label>
            <Input
              type="password"
              maxLength={4}
              inputMode="numeric"
              placeholder="••••"
              value={oldPin}
              onChange={(e) => setOldPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="text-center text-lg tracking-[0.5em] font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">New PIN</label>
            <Input
              type="password"
              maxLength={4}
              inputMode="numeric"
              placeholder="••••"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="text-center text-lg tracking-[0.5em] font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Confirm New PIN</label>
            <Input
              type="password"
              maxLength={4}
              inputMode="numeric"
              placeholder="••••"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="text-center text-lg tracking-[0.5em] font-mono"
            />
          </div>
        </div>

        <Button
          className="w-full h-12"
          onClick={handlePinChange}
          disabled={loading || oldPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
          Change PIN
        </Button>
      </div>
    );
  }

  /* ─── OVERVIEW (card management) ─── */
  return (
    <div className="space-y-5">
      {loading && cards.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : activeCard ? (
        <>
          {/* The Card */}
          <CardVisual card={activeCard} revealed={revealed} onToggleReveal={revealDetails} />

          {/* Status + activation */}
          {activeCard.status === "pending" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-warning/5 border border-warning/20 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-warning">Activate Your Card</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your card is created but needs activation before use.
                  </p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={handleActivate}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
                    Activate Now
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Default PIN prompt after activation */}
          {defaultPin && activeCard.status === "active" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary/5 border border-primary/20 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <KeyRound className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">Default PIN: <span className="font-mono">{defaultPin}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Change this to your own PIN for security.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setView("pin-change")}
                  >
                    Change PIN →
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Card Actions */}
          {activeCard.status !== "pending" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-3 gap-2.5"
            >
              {[
                {
                  label: "Change PIN",
                  icon: KeyRound,
                  color: "bg-blue-500/10 text-blue-600",
                  action: () => setView("pin-change"),
                  disabled: activeCard.status === "blocked",
                },
                {
                  label: activeCard.status === "blocked" ? "Unblock" : "Block",
                  icon: activeCard.status === "blocked" ? Unlock : Lock,
                  color: activeCard.status === "blocked" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600",
                  action: activeCard.status === "blocked" ? handleUnblock : handleBlock,
                  disabled: false,
                },
                {
                  label: revealed ? "Hide" : "Reveal",
                  icon: revealed ? EyeOff : Eye,
                  color: "bg-purple-500/10 text-purple-600",
                  action: revealDetails,
                  disabled: false,
                },
              ].map((item, i) => (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.95 }}
                  onClick={item.action}
                  disabled={item.disabled || loading}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border/60 hover:border-primary/30 transition-all disabled:opacity-40"
                >
                  <div className={`w-11 h-11 rounded-xl ${item.color} flex items-center justify-center`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">{item.label}</p>
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Card Info */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card className="border-border/50">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-bold text-foreground">Card Details</h3>
                <div className="divide-y divide-border/30">
                  {[
                    { label: "Card Type", value: "Verve Virtual" },
                    { label: "Status", value: activeCard.status.charAt(0).toUpperCase() + activeCard.status.slice(1) },
                    { label: "Issuance Fee", value: `₦${(activeCard.issuance_fee || ISSUANCE_FEE).toLocaleString()}` },
                    { label: "Created", value: new Date(activeCard.created_at).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" }) },
                    ...(activeCard.activated_at ? [{ label: "Activated", value: new Date(activeCard.activated_at).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" }) }] : []),
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between py-2.5">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className="text-xs font-semibold text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </>
      ) : null}
    </div>
  );
}
