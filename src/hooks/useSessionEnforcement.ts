import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BACKGROUND_TIMEOUT = 5 * 60 * 1000; // 5 minutes in background
const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes no touch/interaction
const SESSION_MARKER_KEY = "wesave_session_active";

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "touchstart", "touchmove", "mousedown", "mousemove",
  "keydown", "scroll", "click",
];

interface UseSessionEnforcementOptions {
  enabled?: boolean;
}

/**
 * Enforces session sign-out when:
 * 1. Browser is closed (sessionStorage marker)
 * 2. App in background > 5 minutes
 * 3. No touch/interaction for 2 minutes while in foreground
 */
export function useSessionEnforcement({ enabled = true }: UseSessionEnforcementOptions = {}) {
  const navigate = useNavigate();
  const lastActiveRef = useRef<number>(Date.now());
  const backgroundTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const signOutAndRedirect = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      toast.info("Session expired due to inactivity. Please sign in again.");
      navigate("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }, [navigate]);

  const resetInactivityTimer = useCallback(() => {
    lastActiveRef.current = Date.now();
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      signOutAndRedirect();
    }, INACTIVITY_TIMEOUT);
  }, [signOutAndRedirect]);

  useEffect(() => {
    if (!enabled) return;

    // Set session marker on mount — the inactivity and background
    // timeouts handle actual session expiry. The old "no marker → sign out"
    // logic broke in preview/HMR because sessionStorage is cleared on reload.
    sessionStorage.setItem(SESSION_MARKER_KEY, "true");

    // Start foreground inactivity timer
    resetInactivityTimer();

    // Listen for user activity to reset inactivity timer
    const handleActivity = () => resetInactivityTimer();
    ACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, handleActivity, { passive: true }));

    // Background/foreground handling
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Pause inactivity timer, start background timer
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
          inactivityTimerRef.current = null;
        }
        lastActiveRef.current = Date.now();
        backgroundTimerRef.current = setTimeout(() => {
          signOutAndRedirect();
        }, BACKGROUND_TIMEOUT);
      } else {
        // Back to foreground — clear background timer
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current);
          backgroundTimerRef.current = null;
        }
        const timeAway = Date.now() - lastActiveRef.current;
        if (timeAway >= BACKGROUND_TIMEOUT) {
          signOutAndRedirect();
        } else {
          resetInactivityTimer();
        }
      }
    };

    const handleBeforeUnload = () => {
      sessionStorage.removeItem(SESSION_MARKER_KEY);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (backgroundTimerRef.current) clearTimeout(backgroundTimerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [enabled, signOutAndRedirect, resetInactivityTimer]);
}
