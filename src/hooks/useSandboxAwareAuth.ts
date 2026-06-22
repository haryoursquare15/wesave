import { useContext } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { supabase } from "@/integrations/supabase/client";
import { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext } from "react";

// A tiny passthrough context so the sandbox layout can flag "we are in sandbox
// mode" without importing SandboxAuthContext (avoids circular deps).
export const SandboxModeContext = createContext<{ session: Session | null } | null>(null);

interface SandboxAware {
  session: Session | null;
  client: SupabaseClient;
  isSandbox: boolean;
}

/**
 * Returns the session + Supabase client appropriate for the current context.
 * - Inside <SandboxModeContext.Provider>: uses the sandbox client + sandbox session.
 * - Anywhere else: falls back to the main Vestara auth context + main client.
 *
 * This lets shared hooks (useVfdBanking, useVestaraLedger) be reused from both
 * the main app and the isolated sandbox without forking them.
 */
export function useSandboxAwareAuth(): SandboxAware {
  const sandboxCtx = useContext(SandboxModeContext);
  const mainAuth = useAuth();

  if (sandboxCtx) {
    return {
      session: sandboxCtx.session,
      client: sandboxSupabase,
      isSandbox: true,
    };
  }

  return {
    session: mainAuth.session,
    client: supabase,
    isSandbox: false,
  };
}
