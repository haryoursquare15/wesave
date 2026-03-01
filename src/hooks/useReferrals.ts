import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ReferralStats {
  total_referrals: number;
  pending_referrals: number;
  completed_referrals: number;
  total_earned: number;
  liened_amount: number;
  available_amount: number;
}

interface ReferralHistoryItem {
  id: string;
  referred_user_id: string;
  referred_user_name: string;
  referred_username: string | null;
  status: string;
  reward_amount: number;
  created_at: string;
  completed_at: string | null;
  rewarded_at: string | null;
  fraud_flag: boolean;
}

export function useReferrals() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [history, setHistory] = useState<ReferralHistoryItem[]>([]);
  const [referralLink, setReferralLink] = useState<string>("");
  const [referralCode, setReferralCode] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-operations?action=stats`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch referral stats:", err);
    }
  }, [user]);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-operations?action=history`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setHistory(data.referrals || []);
      }
    } catch (err) {
      console.error("Failed to fetch referral history:", err);
    }
  }, [user]);

  const fetchLink = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-operations?action=link`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setReferralLink(data.referral_link || "");
        setReferralCode(data.referral_code || "");
      }
    } catch (err) {
      console.error("Failed to fetch referral link:", err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchStats(), fetchHistory(), fetchLink()]).finally(() => setLoading(false));
  }, [user, fetchStats, fetchHistory, fetchLink]);

  const recordReferral = useCallback(async (refCode: string) => {
    if (!user) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-operations?action=record`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ referral_code: refCode }),
        }
      );
      return await res.json();
    } catch (err) {
      console.error("Failed to record referral:", err);
      return { error: "Failed to record referral" };
    }
  }, [user]);

  return {
    stats,
    history,
    referralLink,
    referralCode,
    loading,
    recordReferral,
    refetch: () => Promise.all([fetchStats(), fetchHistory(), fetchLink()]),
  };
}
