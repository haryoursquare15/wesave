import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { secureSignIn } from "@/lib/secureSignIn";

type Profile = Tables<"profiles"> & {
  onboarding_completed?: boolean;
};
type Wallet = Tables<"wallets">;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  wallet: Wallet | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  isOnboardingComplete: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  // Note: Excludes sensitive banking fields (bvn, bank_account, bank_name, phone, flw_* fields)
  // Fetch those separately only when needed in banking/payout settings pages
  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, email, avatar_url, membership_tier, credit_score, completed_cycles, created_at, updated_at, onboarding_completed")
      .eq("id", userId)
      .maybeSingle();
    
    if (!error && data) {
      // Cast to Profile type - sensitive fields will be null/undefined
      setProfile(data as Profile);
    }
  };

  const fetchWallet = async (userId: string) => {
    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (!error && data) {
      setWallet(data);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const refreshWallet = async () => {
    if (user) {
      await fetchWallet(user.id);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const fetchAll = async (userId: string) => {
      await Promise.all([fetchProfile(userId), fetchWallet(userId)]);
    };

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        // Handle stale/invalid refresh tokens gracefully
        if (sessionError) {
          console.warn("Session error:", sessionError.message);
          // Clear any stale tokens and continue as logged out
          await supabase.auth.signOut();
          if (isMounted) {
            setSession(null);
            setUser(null);
            setProfile(null);
            setWallet(null);
          }
          return;
        }

        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchAll(session.user.id);
        } else {
          setProfile(null);
          setWallet(null);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
        // Fail gracefully - user will see logged out state
        if (isMounted) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setWallet(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // Initial load controls the loading flag
    initializeAuth();

    // Listener for ongoing auth changes (does not toggle loading)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      // Handle token refresh failures silently
      if (event === "TOKEN_REFRESHED" && !nextSession) {
        console.warn("Token refresh failed, signing out");
        setSession(null);
        setUser(null);
        setProfile(null);
        setWallet(null);
        return;
      }

      // Only synchronous state updates here (avoid deadlocks)
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      // Set session marker for OAuth / magic-link sign-ins so that
      // useSessionEnforcement doesn't immediately kill the session
      if (nextSession && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        sessionStorage.setItem("wesave_session_active", "true");
      }

      if (nextSession?.user) {
        // Defer any Supabase calls outside the auth callback
        setTimeout(() => {
          fetchAll(nextSession.user.id).catch((err) => {
            console.error("Post-auth fetch error:", err);
          });

          // Record referral if signup ref code exists
          const refCode = sessionStorage.getItem("wesave_referral_code");
          if (refCode && event === "SIGNED_IN") {
            sessionStorage.removeItem("wesave_referral_code");
            fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-operations?action=record`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${nextSession.access_token}`,
                  "Content-Type": "application/json",
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
                body: JSON.stringify({ referral_code: refCode }),
              }
            ).catch((err) => console.error("Referral recording error:", err));
          }
        }, 0);
      } else {
        setProfile(null);
        setWallet(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Global realtime subscription for wallet balance updates
  useEffect(() => {
    if (!user) return;

    const walletChannel = supabase
      .channel(`global-wallet-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Directly update wallet state from the realtime payload
          if (payload.new && typeof payload.new === "object" && "id" in payload.new) {
            setWallet(payload.new as Wallet);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(walletChannel);
    };
  }, [user]);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    // Set session marker BEFORE sign-in so useSessionEnforcement
    // doesn't immediately clear the new session on mount
    sessionStorage.setItem("wesave_session_active", "true");
    
    // Routed through the hardened gate (rate limiting + lockout).
    const { error } = await secureSignIn(supabase, email, password);
    
    if (error) {
      // Clear marker if sign-in failed
      sessionStorage.removeItem("wesave_session_active");
    }
    
    return { error };
  };

  const signOut = async () => {
    // Clear session marker to prevent re-authentication issues
    sessionStorage.removeItem("wesave_session_active");
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setWallet(null);
  };

  const isOnboardingComplete = profile?.onboarding_completed === true;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        wallet,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        refreshWallet,
        isOnboardingComplete,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
