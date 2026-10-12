import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSandboxAuth } from "@/contexts/SandboxAuthContext";
import { loginPinAction } from "@/lib/loginPinApi";
import {
  biometricSupported, clearBiometric, enrollBiometric, hasBiometricSetup, readBiometricToken,
} from "@/lib/quickUnlock";

/** Shared on/off logic for Face ID / fingerprint unlock (WebAuthn platform authenticator). */
export function useBiometricToggle() {
  const { user } = useSandboxAuth();
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(hasBiometricSetup());
  const [busy, setBusy] = useState(false);

  useEffect(() => { void biometricSupported().then(setSupported); }, []);

  const toggle = useCallback(async (next: boolean) => {
    if (!user) return false;
    setBusy(true);
    try {
      if (next) {
        const r = await loginPinAction({ action: "enable_biometric", device_label: navigator.userAgent });
        if (!r?.success || !r.device_token) { toast.error(r?.error || "Couldn't turn on biometrics."); return false; }
        const ok = await enrollBiometric(user.id, user.email || "", r.device_token);
        if (!ok) {
          await loginPinAction({ action: "disable_biometric", device_token: r.device_token });
          toast.error("Fingerprint / Face ID check was cancelled. Try again and touch the sensor when asked.");
          return false;
        }
        setOn(true);
        toast.success("Fingerprint / Face ID unlock is on");
      } else {
        const t = readBiometricToken();
        if (t) await loginPinAction({ action: "disable_biometric", device_token: t });
        clearBiometric();
        setOn(false);
        toast.success("Biometric unlock is off");
      }
      return true;
    } finally {
      setBusy(false);
    }
  }, [user]);

  return { supported, on, busy, toggle, setOn };
}
