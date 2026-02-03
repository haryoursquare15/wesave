import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to enforce session sign-out when:
 * 1. Browser is closed completely (via beforeunload + sessionStorage check)
 * 2. App is in background for more than 5 minutes
 */
export function useSessionEnforcement() {
  const navigate = useNavigate();
  const lastActiveRef = useRef<number>(Date.now());
  const visibilityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const signOutAndRedirect = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      toast.info("Session expired. Please sign in again.");
      navigate("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }, [navigate]);

  useEffect(() => {
    // Check if this is a fresh browser session
    const sessionMarker = sessionStorage.getItem("thrift_session_active");
    
    if (!sessionMarker) {
      // Fresh browser session - clear any existing auth
      const checkAndClearSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // User had a session from before browser was closed
          await supabase.auth.signOut();
        }
      };
      checkAndClearSession();
    }
    
    // Mark session as active
    sessionStorage.setItem("thrift_session_active", "true");

    // Handle visibility change (app goes to background)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background - start timer
        lastActiveRef.current = Date.now();
        visibilityTimeoutRef.current = setTimeout(() => {
          signOutAndRedirect();
        }, INACTIVITY_TIMEOUT);
      } else {
        // App came back to foreground
        if (visibilityTimeoutRef.current) {
          clearTimeout(visibilityTimeoutRef.current);
          visibilityTimeoutRef.current = null;
        }
        
        // Check how long user was away
        const timeAway = Date.now() - lastActiveRef.current;
        if (timeAway >= INACTIVITY_TIMEOUT) {
          signOutAndRedirect();
        }
      }
    };

    // Handle page unload (browser close)
    const handleBeforeUnload = () => {
      // Clear session marker on browser close
      // Note: This won't work for all cases but helps with normal closure
      sessionStorage.removeItem("thrift_session_active");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
      }
    };
  }, [signOutAndRedirect]);
}
