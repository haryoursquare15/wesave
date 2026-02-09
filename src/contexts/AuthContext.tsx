import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

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

      if (nextSession?.user) {
        // Defer any Supabase calls outside the auth callback
        setTimeout(() => {
          fetchAll(nextSession.user.id).catch((err) => {
            console.error("Post-auth fetch error:", err);
          });
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
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
