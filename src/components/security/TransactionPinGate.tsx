import { useState, useEffect, useCallback, useRef } from "react";
import { Shield, Loader2, Lock, AlertTriangle, KeyRound, XCircle, Timer } from "lucide-react";
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

type Phase =
  | "loading"
  | "setup_new"
  | "setup_confirm"
  | "verify"
  | "locked"
  | "error";

/**
 * Reusable transaction PIN gate.
 *
 * - Inline setup if no PIN exists, single verify if it does.
 * - Errors surface in a dedicated in-dialog error screen (with attempts remaining).
 * - Lockouts show a live mm:ss countdown until expiry, then auto-recover to verify.
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

  const [phase, setPhase] = useState<Phase>("loading");
  const [pin, setPin1] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Error screen state
  const [errorTitle, setErrorTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [returnPhase, setReturnPhase] = useState<Phase>("verify");

  // Countdown
  const [countdown, setCountdown] = useState("15:00");
  const initRef = useRef<() => void>(() => {});

  const reset = useCallback(() => {
    setPin1("");
    setPinConfirm("");
    setLockedUntil(null);
    setErrorTitle("");
    setErrorMessage("");
    setAttemptsRemaining(null);
  }, []);

  const initialize = useCallback(async () => {
    setPhase("loading");
    reset();
    const status = await getStatus();
    if (!status) {
      setErrorTitle("Could not check security");
      setErrorMessage("We couldn't verify your security status. Please try again in a moment.");
      setReturnPhase("verify");
      setPhase("error");
      return;
    }
    if (status.is_locked) {
      setLockedUntil(status.locked_until);
      setPhase("locked");
      return;
    }
    setPhase(status.has_pin ? "verify" : "setup_new");
  }, [getStatus, reset]);

  initRef.current = initialize;

  useEffect(() => {
    if (open) initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live lockout countdown
  useEffect(() => {
    if (phase !== "locked" || !lockedUntil) return;
    const tick = () => {
      const ms = new Date(lockedUntil).getTime() - Date.now();
      if (ms <= 0) {
        setCountdown("0:00");
        // Auto-recover when timer ends
        initRef.current();
        return;
      }
      const total = Math.floor(ms / 1000);
      const m = Math.floor(total / 60);
      const s = total % 60;
      setCountdown(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, lockedUntil]);

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
      setErrorTitle("PINs don't match");
      setErrorMessage("The two PINs you entered are different. Please set your PIN again.");
      setReturnPhase("setup_new");
      setPhase("error");
      return;
    }
    setSubmitting(true);
    const res = await setPin(pin);
    setSubmitting(false);
    if (!res?.success) {
      setErrorTitle("Couldn't set PIN");
      setErrorMessage(
        res?.error ||
          "Try a different 4-digit PIN. Avoid sequential (1234), repeated (1111) or obvious (0000) digits."
      );
      setReturnPhase("setup_new");
      setPhase("error");
      return;
    }
    toast({ title: "Transaction PIN set", description: "You can now authorize this transaction." });
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
      setLockedUntil(res.locked_until || new Date(Date.now() + 15 * 60_000).toISOString());
      setPin1("");
      setPhase("locked");
      return;
    }
    if (!res?.success) {
      setAttemptsRemaining(
        typeof res?.attempts_remaining === "number" ? res.attempts_remaining : null
      );
      setErrorTitle("Incorrect PIN");
      setErrorMessage(
        res?.error?.replace(/\.\s*\d+\s*attempts?\s*remaining\.?/i, "").trim() ||
          "The PIN you entered doesn't match our records."
      );
      setReturnPhase("verify");
      setPin1("");
      setPhase("error");
      return;
    }
    onOpenChange(false);
    reset();
    onVerified();
  };

  const handleErrorTryAgain = () => {
    setErrorTitle("");
    setErrorMessage("");
    setAttemptsRemaining(null);
    setPin1("");
    setPinConfirm("");
    if (returnPhase === "setup_new") setPhase("setup_new");
    else if (returnPhase === "setup_confirm") setPhase("setup_confirm");
    else setPhase("verify");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div
            className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center mb-2 ${
              phase === "locked"
                ? "bg-destructive/10"
                : phase === "error"
                ? "bg-destructive/10"
                : "bg-primary/10"
            }`}
          >
            {phase === "locked" ? (
              <Lock className="h-7 w-7 text-destructive" />
            ) : phase === "error" ? (
              <XCircle className="h-7 w-7 text-destructive" />
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
            {phase === "error" && errorTitle}
          </DialogTitle>
          <DialogDescription className="text-center">
            {phase === "setup_new" &&
              "Choose a 4-digit PIN to authorize transactions. Keep it private — like an ATM PIN."}
            {phase === "setup_confirm" && "Re-enter the PIN to confirm."}
            {phase === "verify" && `Authorize: ${purpose}`}
            {phase === "locked" &&
              "Too many failed attempts. For your security, PIN entry is paused."}
            {phase === "error" && errorMessage}
          </DialogDescription>
        </DialogHeader>

        {description && phase === "verify" && (
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
            <InputOTP maxLength={4} value={pin} onChange={setPin1} autoFocus inputMode="numeric" pattern="[0-9]*">
              <InputOTPGroup>
                <InputOTPSlot index={0} mask className="h-14 w-14 text-xl" />
                <InputOTPSlot index={1} mask className="h-14 w-14 text-xl" />
                <InputOTPSlot index={2} mask className="h-14 w-14 text-xl" />
                <InputOTPSlot index={3} mask className="h-14 w-14 text-xl" />
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
            <InputOTP maxLength={4} value={pinConfirm} onChange={setPinConfirm} autoFocus inputMode="numeric" pattern="[0-9]*">
              <InputOTPGroup>
                <InputOTPSlot index={0} mask className="h-14 w-14 text-xl" />
                <InputOTPSlot index={1} mask className="h-14 w-14 text-xl" />
                <InputOTPSlot index={2} mask className="h-14 w-14 text-xl" />
                <InputOTPSlot index={3} mask className="h-14 w-14 text-xl" />
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center gap-3 py-2">
            {attemptsRemaining !== null && (
              <div
                className={`w-full rounded-lg border px-3 py-2 text-center text-sm ${
                  attemptsRemaining <= 2
                    ? "bg-destructive/5 border-destructive/30 text-destructive"
                    : "bg-warning/5 border-warning/30 text-foreground"
                }`}
              >
                <span className="font-semibold">
                  {attemptsRemaining} {attemptsRemaining === 1 ? "attempt" : "attempts"} remaining
                </span>
                <p className="text-xs mt-0.5 text-muted-foreground">
                  After 5 failed attempts, PIN entry is locked for 15 minutes.
                </p>
              </div>
            )}
          </div>
        )}

        {phase === "locked" && (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-full rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 flex flex-col items-center gap-2">
              <Timer className="h-6 w-6 text-destructive" />
              <div className="text-3xl font-mono font-bold tabular-nums text-destructive">
                {countdown}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Try again at{" "}
                <span className="font-medium text-foreground">
                  {lockedUntil ? new Date(lockedUntil).toLocaleTimeString() : "—"}
                </span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Forgot your PIN? Contact support to reset it after the lockout.
            </p>
          </div>
        )}

        {phase !== "loading" && phase !== "locked" && phase !== "error" && (
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

        {phase === "error" && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleCancel}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleErrorTryAgain}>
              Try Again
            </Button>
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
