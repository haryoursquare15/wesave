import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { secureSignIn } from "@/lib/secureSignIn";

interface SandboxAuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const SandboxAuthContext = createContext<SandboxAuthContextType | undefined>(undefined);

export function SandboxAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session: s } } = await sandboxSupabase.auth.getSession();
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);
      } catch (err) {
        console.error("Sandbox auth init error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = sandboxSupabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      setUser(next?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await sandboxSupabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/vfd-sandbox`,
        data: { full_name: fullName, sandbox_account: true },
      },
    });
    if (error) return { error };

    // Auto-confirm sandbox accounts so testers can use throwaway emails
    // without waiting for a verification mail.
    try {
      await sandboxSupabase.functions.invoke("sandbox-auto-confirm", {
        body: { email },
      });
    } catch (confirmErr) {
      console.warn("sandbox auto-confirm failed:", confirmErr);
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    // Routed through the hardened gate (rate limiting + lockout).
    const { error } = await secureSignIn(sandboxSupabase, email, password);
    return { error };
  };

  const signOut = async () => {
    await sandboxSupabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <SandboxAuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </SandboxAuthContext.Provider>
  );
}

export function useSandboxAuth() {
  const ctx = useContext(SandboxAuthContext);
  if (!ctx) throw new Error("useSandboxAuth must be used within a SandboxAuthProvider");
  return ctx;
}
