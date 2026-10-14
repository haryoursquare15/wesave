import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { useDeviceFingerprint } from "@/hooks/useDeviceFingerprint";

/**
 * Enforces a single active device per user for the sandbox app.
 * On mount: registers the current fingerprint and removes any other devices
 * (triggering a notification email). While mounted: polls every 60s and signs
 * the user out locally if the current fingerprint was removed from elsewhere.
 */
export function useDeviceEnforcement(enabled: boolean) {
  const device = useDeviceFingerprint();
  const navigate = useNavigate();
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || !device) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    // Only call the backend with a live session. If the stored token is near
    // expiry, refresh it first; if refresh fails, skip quietly (the auth
    // listener handles sign-out) rather than firing a request that will 401.
    const hasSession = async () => {
      const { data } = await sandboxSupabase.auth.getSession();
      const s = data.session;
      if (!s) return false;
      if (!s.expires_at || s.expires_at * 1000 > Date.now() + 30_000) return true;
      const { data: r, error } = await sandboxSupabase.auth.refreshSession();
      return !error && !!r.session;
    };

    const register = async () => {
      try {
        if (!(await hasSession())) return;
        await sandboxSupabase.functions.invoke("security-controls", {
          body: {
            action: "enforce_single_device",
            fingerprint: device.fingerprint,
            device_name: device.device_name,
            browser: device.browser,
            os: device.os,
          },
        });
      } catch (err) {
        console.warn("device enforcement register failed", err);
      }
    };

    const poll = async () => {
      try {
        if (!(await hasSession())) return;
        const { data, error } = await sandboxSupabase.functions.invoke("security-controls", {
          body: { action: "get_devices" },
        });
        // Never sign out on a failed check — only when the list loads and this device is gone.
        if (error || !Array.isArray(data?.devices)) return;
        const list = data.devices as Array<{ device_fingerprint?: string }>;
        const stillHere = list.some(d => d.device_fingerprint === device.fingerprint);
        if (!stillHere && !cancelled) {
          toast.info("You were signed out because your account was accessed from another device.");
          await sandboxSupabase.auth.signOut();
          sessionStorage.removeItem("vestara_sandbox_signed_in");
          sessionStorage.removeItem("vestara_splash_seen");
          navigate("/signin");
        }
      } catch { /* ignore */ }
    };

    if (!registered.current) {
      registered.current = true;
      void register();
    }
    interval = setInterval(poll, 60_000);
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [enabled, device, navigate]);
}
