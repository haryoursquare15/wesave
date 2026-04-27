import { useState, useEffect, useCallback } from "react";
import { Shield, Loader2, Lock, AlertTriangle, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useTransactionPin } from "@/hooks/useTransactionPin";
import { useToast } from "@/hooks/use-toast";

export type PinGateMode = "verify" | "setup";

interface TransactionPinGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Human-readable label for the action being authorized (e.g. "Lock Funds", "Withdraw") */
  purpose: string;
  /** Optional context line shown to the user (e.g. amount, recipient) */
  description?: string;
  /** Called when verification (or first-time setup + verify) succeeds */
  onVerified: () => void;
  /** Called when user cancels */
  onCancel?: () => void;
}

/**
 * Reusable transaction PIN gate.
 *
 * - On open it checks `get_status`.
 * - If no PIN exists, the user is walked through Set → Confirm.
 *   After a successful set, `onVerified` is fired (no second prompt for the same action).
 * - If a PIN exists, the user enters it once. On success → onVerified.
 * - Lockouts are surfaced clearly.
 */
export function TransactionPinGate({
  open,
  onOpenChange,
  purpose,
  description,
  onVerified,
  onCancel,
}: TransactionPinGateProps) {
  const { toast } = useToast();
  const { loading, getStatus, setPin, verifyPin } = useTransactionPin();

  const [phase, setPhase] = useState<"loading" | "setup_new" | "setup_confirm" | "verify" | "locked">("loading");
  const [pin, setPin1] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setPin1("");
    setPinConfirm("");
    setLockedUntil(null);
  }, []);

  const initialize = useCallback(async () => {
    setPhase("loading");
    reset();
    const status = await getStatus();
    if (!status) {
      toast({ title: "Could not check security status", variant: "destructive" });
      onOpenChange(false);
      return;
    }
    if (status.is_locked) {
      setLockedUntil(status.locked_until);
      setPhase("locked");
      return;
    }
    setPhase(status.has_pin ? "verify" : "setup_new");
  }, [getStatus, onOpenChange, reset, toast]);

  useEffect(() => {
    if (open) initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCancel = () => {
    onOpenChange(false);
    reset();
    onCancel?.();
  };

  const handleSetupNext = () => {
    if (pin.length !== 4) return;
    setPhase("setup_confirm");
  };

  const handleSetupConfirm = async () => {
    if (pinConfirm.length !== 4) return;
    if (pin !== pinConfirm) {
      toast({ title: "PINs do not match", description: "Please re-enter your PIN.", variant: "destructive" });
      setPinConfirm("");
      return;
    }
    setSubmitting(true);
    const res = await setPin(pin);
    setSubmitting(false);
    if (!res?.success) {
      toast({ title: "Could not set PIN", description: res?.error || "Try a different PIN.", variant: "destructive" });
      setPin1("");
      setPinConfirm("");
      setPhase("setup_new");
      return;
    }
    toast({ title: "Transaction PIN set", description: "You can now authorize this transaction." });
    // After setting, immediately authorize this action — no need to re-prompt.
    onOpenChange(false);
    reset();
    onVerified();
  };

  const handleVerify = async () => {
    if (pin.length !== 4) return;
    setSubmitting(true);
    const res = await verifyPin(pin, purpose);
    setSubmitting(false);
    if (res?.is_locked) {
      setLockedUntil(res.locked_until);
      setPhase("locked");
      setPin1("");
      return;
    }
    if (!res?.success) {
      toast({ title: "Incorrect PIN", description: res?.error || "Try again.", variant: "destructive" });
      setPin1("");
      return;
    }
    onOpenChange(false);
    reset();
    onVerified();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            {phase === "locked" ? (
              <Lock className="h-7 w-7 text-destructive" />
            ) : phase === "setup_new" || phase === "setup_confirm" ? (
              <KeyRound className="h-7 w-7 text-primary" />
            ) : (
              <Shield className="h-7 w-7 text-primary" />
            )}
          </div>
          <DialogTitle className="text-center">
            {phase === "loading" && "Checking security…"}
            {phase === "setup_new" && "Set Your Transaction PIN"}
            {phase === "setup_confirm" && "Confirm Your PIN"}
            {phase === "verify" && "Enter Transaction PIN"}
            {phase === "locked" && "PIN Temporarily Locked"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {phase === "setup_new" &&
              "Choose a 4-digit PIN to authorize transactions. Keep it private — like an ATM PIN."}
            {phase === "setup_confirm" && "Re-enter the PIN to confirm."}
            {phase === "verify" && `Authorize: ${purpose}`}
            {phase === "locked" &&
              `Too many failed attempts. Try again after ${
                lockedUntil ? new Date(lockedUntil).toLocaleTimeString() : "15 minutes"
              }.`}
          </DialogDescription>
        </DialogHeader>

        {description && phase !== "locked" && phase !== "loading" && (
          <div className="text-center text-sm text-muted-foreground bg-muted/50 rounded-lg py-2 px-3">
            {description}
          </div>
        )}

        {phase === "loading" && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {(phase === "setup_new" || phase === "verify") && (
          <div className="flex flex-col items-center gap-4 py-2">
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={setPin1}
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className="h-14 w-14 text-xl" />
                <InputOTPSlot index={1} className="h-14 w-14 text-xl" />
                <InputOTPSlot index={2} className="h-14 w-14 text-xl" />
                <InputOTPSlot index={3} className="h-14 w-14 text-xl" />
              </InputOTPGroup>
            </InputOTP>
            {phase === "setup_new" && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-warning/5 border border-warning/20 rounded-lg p-2 w-full">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <p>Avoid 1234, 0000, repeated or sequential digits. Your PIN is encrypted and never stored in plain text.</p>
              </div>
            )}
          </div>
        )}

        {phase === "setup_confirm" && (
          <div className="flex justify-center py-2">
            <InputOTP
              maxLength={4}
              value={pinConfirm}
              onChange={setPinConfirm}
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className="h-14 w-14 text-xl" />
                <InputOTPSlot index={1} className="h-14 w-14 text-xl" />
                <InputOTPSlot index={2} className="h-14 w-14 text-xl" />
                <InputOTPSlot index={3} className="h-14 w-14 text-xl" />
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}

        {phase !== "loading" && phase !== "locked" && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleCancel} disabled={submitting || loading}>
              Cancel
            </Button>
            {phase === "setup_new" && (
              <Button className="flex-1" onClick={handleSetupNext} disabled={pin.length !== 4 || submitting}>
                Next
              </Button>
            )}
            {phase === "setup_confirm" && (
              <Button className="flex-1" onClick={handleSetupConfirm} disabled={pinConfirm.length !== 4 || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
              </Button>
            )}
            {phase === "verify" && (
              <Button className="flex-1" onClick={handleVerify} disabled={pin.length !== 4 || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Authorize"}
              </Button>
            )}
          </div>
        )}

        {phase === "locked" && (
          <Button variant="outline" className="w-full" onClick={handleCancel}>
            Close
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
