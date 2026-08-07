import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { toast } from "sonner";

// Banking-app realistic timeouts. Short windows (2m) kicked users out
// mid-form while filling SplitPay / Goal / Target / Transfer flows.
const BACKGROUND_TIMEOUT = 30 * 60 * 1000; // 30 minutes in background
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes no interaction

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "touchstart", "touchmove", "mousedown", "mousemove",
  "keydown", "keyup", "input", "change", "scroll", "click", "focus",
];

/**
 * Sandbox-scoped inactivity sign-out.
 * Signs the user out of the sandbox after 2m of no interaction (foreground)
 * or 5m in the background, then redirects to the sandbox login page.
 */
export function useSandboxSessionEnforcement({ enabled = true }: { enabled?: boolean } = {}) {
  const navigate = useNavigate();
  const lastActiveRef = useRef<number>(Date.now());
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOutAndRedirect = useCallback(async () => {
    try {
      sessionStorage.removeItem("vestara_sandbox_signed_in");
      sessionStorage.removeItem("vestara_splash_seen");
      await sandboxSupabase.auth.signOut();
      toast.info("Sandbox session expired due to inactivity. Please sign in again.");
      navigate("/signin");
    } catch (err) {
      console.error("Sandbox sign-out error:", err);
    }
  }, [navigate]);

  const resetInactivityTimer = useCallback(() => {
    lastActiveRef.current = Date.now();
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(signOutAndRedirect, INACTIVITY_TIMEOUT);
  }, [signOutAndRedirect]);

  useEffect(() => {
    if (!enabled) return;

    resetInactivityTimer();

    const handleActivity = () => resetInactivityTimer();
    ACTIVITY_EVENTS.forEach((evt) =>
      document.addEventListener(evt, handleActivity, { passive: true, capture: true })
    );

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
          inactivityTimerRef.current = null;
        }
        lastActiveRef.current = Date.now();
        backgroundTimerRef.current = setTimeout(signOutAndRedirect, BACKGROUND_TIMEOUT);
      } else {
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current);
          backgroundTimerRef.current = null;
        }
        const timeAway = Date.now() - lastActiveRef.current;
        if (timeAway >= BACKGROUND_TIMEOUT) signOutAndRedirect();
        else resetInactivityTimer();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        document.removeEventListener(evt, handleActivity, { capture: true } as EventListenerOptions)
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (backgroundTimerRef.current) clearTimeout(backgroundTimerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [enabled, signOutAndRedirect, resetInactivityTimer]);
}
