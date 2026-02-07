 import { useState, useEffect, useCallback } from "react";
 import { supabase } from "@/integrations/supabase/client";
 
 export interface EnhancedAdminStats {
   total_users: number;
   verified_users: number;
   unverified_users: number;
   total_wallet_balance: number;
   total_groups: number;
   active_groups: number;
   completed_cycles: number;
   contributions_today: number;
   total_funding_volume: number;
   total_payouts: number;
   platform_revenue: number;
   failed_transactions: number;
   risk_alerts: number;
   pending_requests: number;
   open_tickets: number;
 }
 
 export type TimeFilter = "today" | "7d" | "30d" | "custom";
 
export function useEnhancedAdminStats(timeFilter: TimeFilter = "30d") {
  const [stats, setStats] = useState<EnhancedAdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Stats fetch timed out')), 15000)
      );
      
      const fetchPromise = supabase.rpc("admin_get_enhanced_stats", {
        _time_filter: timeFilter,
      });

      const { data, error: rpcError } = await Promise.race([fetchPromise, timeoutPromise.then(() => { throw new Error('timeout'); })]) as Awaited<typeof fetchPromise>;
      
      if (rpcError) throw rpcError;
      setStats(data as unknown as EnhancedAdminStats);
    } catch (err) {
      console.error("Error fetching enhanced admin stats:", err);
      setError(err as Error);
      // Set default stats on error to prevent blank dashboard
      setStats({
        total_users: 0,
        verified_users: 0,
        unverified_users: 0,
        total_wallet_balance: 0,
        total_groups: 0,
        active_groups: 0,
        completed_cycles: 0,
        contributions_today: 0,
        total_funding_volume: 0,
        total_payouts: 0,
        platform_revenue: 0,
        failed_transactions: 0,
        risk_alerts: 0,
        pending_requests: 0,
        open_tickets: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}