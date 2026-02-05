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
     try {
       const { data, error: rpcError } = await supabase.rpc("admin_get_enhanced_stats", {
         _time_filter: timeFilter,
       });
       if (rpcError) throw rpcError;
       setStats(data as unknown as EnhancedAdminStats);
     } catch (err) {
       console.error("Error fetching enhanced admin stats:", err);
       setError(err as Error);
     } finally {
       setLoading(false);
     }
   }, [timeFilter]);
 
   useEffect(() => {
     fetchStats();
   }, [fetchStats]);
 
   return { stats, loading, error, refetch: fetchStats };
 }