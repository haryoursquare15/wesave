import { useEffect, useState } from "react";
import { Loader2, Fingerprint, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useSandboxAuth } from "@/contexts/SandboxAuthContext";
import { loginPinAction } from "@/lib/loginPinApi";
import {
  biometricSupported, clearBiometric, clearQuickUnlock, enrollBiometric,
  hasBiometricSetup, readBiometricToken, saveQuickUnlock,
} from "@/lib/quickUnlock";

const six = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export function LoginPinSettings() {
  const { user } = useSandboxAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [mode, setMode] = useState<"idle" | "set" | "change">("idle");
  const [cur, setCur] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [bioOk, setBioOk] = useState(false);
  const [bioOn, setBioOn] = useState(hasBiometricSetup());

  useEffect(() => {
    void (async () => {
      const r = await loginPinAction({ action: "get_status" });
      setHasPin(!!r?.has_pin);
      if (r?.has_pin && user?.email) saveQuickUnlock(user.email, true);
      setBioOk(await biometricSupported());
      setLoading(false);
    })();
  }, [user?.email]);

  const reset = () => { setMode("idle"); setCur(""); setPin(""); setConfirm(""); };

  const submit = async () => {
    if (pin.length !== 6) return toast.error("Login PIN must be 6 digits.");
    if (pin !== confirm) return toast.error("PINs don't match.");
    setBusy(true);
    const r = mode === "change"
      ? await loginPinAction({ action: "change_pin", current_pin: cur, new_pin: pin })
      : await loginPinAction({ action: "set_pin", pin });
    setBusy(false);
    if (!r?.success) return toast.error(r?.error || "Couldn't save your login PIN.");
    setHasPin(true);
    if (user?.email) saveQuickUnlock(user.email, true);
    toast.success(mode === "change" ? "Login PIN changed" : "Login PIN set. This phone will open with your PIN.");
    reset();
  };

  const disable = async () => {
    setBusy(true);
    const r = await loginPinAction({ action: "disable_pin" });
    setBusy(false);
    if (!r?.success) return toast.error(r?.error || "Couldn't turn off login PIN.");
    clearQuickUnlock();
    setHasPin(false);
    setBioOn(false);
    toast.success("Login PIN turned off");
  };

  const toggleBio = async (on: boolean) => {
    if (!user) return;
    setBusy(true);
    try {
      if (on) {
        const r = await loginPinAction({ action: "enable_biometric", device_label: navigator.userAgent });
        if (!r?.success || !r.device_token) return toast.error(r?.error || "Couldn't turn on biometrics.");
        const ok = await enrollBiometric(user.id, user.email || "", r.device_token);
        if (!ok) {
          await loginPinAction({ action: "disable_biometric", device_token: r.device_token });
          return toast.error("Biometric check was cancelled or isn't available.");
        }
        setBioOn(true);
        toast.success("Face ID / fingerprint unlock is on");
      } else {
        const t = readBiometricToken();
        if (t) await loginPinAction({ action: "disable_biometric", device_token: t });
        clearBiometric();
        setBioOn(false);
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 text-primary" />
        <div className="flex-1">
          <p className="font-medium text-foreground">6-digit login PIN</p>
          <p className="text-sm text-muted-foreground">
            Open Vestara on this phone without typing your password. This is separate from your 4-digit payment PIN.
          </p>
        </div>
      </div>

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {hasPin ? (
            <>
              <Button variant="outline" onClick={() => setMode("change")} disabled={busy}>Change PIN</Button>
              <Button variant="ghost" className="text-destructive" onClick={disable} disabled={busy}>Turn off</Button>
            </>
          ) : (
            <Button onClick={() => setMode("set")} disabled={busy}>Set login PIN</Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {mode === "change" && (
            <Input type="password" inputMode="numeric" placeholder="Current 6-digit PIN" value={cur} onChange={(e) => setCur(six(e.target.value))} />
          )}
          <Input type="password" inputMode="numeric" placeholder="New 6-digit PIN" value={pin} onChange={(e) => setPin(six(e.target.value))} />
          <Input type="password" inputMode="numeric" placeholder="Confirm new PIN" value={confirm} onChange={(e) => setConfirm(six(e.target.value))} />
          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
            <Button variant="ghost" onClick={reset} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      {hasPin && bioOk && (
        <div className="flex items-center gap-3 rounded-xl border border-border p-3">
          <Fingerprint className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="font-medium text-foreground">Face ID / fingerprint</p>
            <p className="text-xs text-muted-foreground">Unlock on this phone with your biometrics.</p>
          </div>
          <Switch checked={bioOn} onCheckedChange={toggleBio} disabled={busy} aria-label="Biometric unlock" />
        </div>
      )}
    </div>
  );
}
