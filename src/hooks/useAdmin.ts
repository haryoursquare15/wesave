import { useState, useEffect, useCallback } from "react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// LEGACY (WeSave decommission): this file still queries dropped tables/RPCs.
// Kept as dead code pending a dedicated frontend cleanup pass.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;
import { useAuth } from "@/contexts/AuthContext";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AdminStats {
  total_users: number;
  total_groups: number;
  active_groups: number;
  pending_groups: number;
  total_transactions: number;
  total_volume: number;
}

interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  membership_tier: "gold" | "silver" | "bronze" | "newbie";
  credit_score: number | null;
  created_at: string;
  role: "admin" | "moderator" | "user" | null;
}

interface AdminGroup {
  id: string;
  name: string;
  admin_id: string;
  admin_name: string | null;
  status: string;
  member_count: number;
  contribution_amount: number;
  period: string;
  created_at: string;
  source?: "legacy" | "sandbox";
}

export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("is_any_admin", { _user_id: user.id });
        if (error) throw error;
        setIsAdmin(data === true);
      } catch (err) {
        console.error("Error checking admin status:", err);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    }

    checkAdmin();
  }, [user]);

  return { isAdmin, loading };
}

export function useAdminStats() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const { data, error: rpcError } = await supabase.rpc("admin_get_stats");
      clearTimeout(timeoutId);
      
      if (rpcError) throw rpcError;
      setStats(data as unknown as AdminStats);
    } catch (err) {
      console.error("Error fetching admin stats:", err);
      setError(err as Error);
      // Set default stats on error
      setStats({
        total_users: 0,
        total_groups: 0,
        active_groups: 0,
        pending_groups: 0,
        total_transactions: 0,
        total_volume: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_get_all_users");
      if (rpcError) throw rpcError;
      setUsers((data as AdminUser[]) || []);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return { users, loading, error, refetch: fetchUsers };
}

export function useAdminGroups() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_get_all_groups");
      if (rpcError) throw rpcError;
      setGroups((data as AdminGroup[]) || []);
    } catch (err) {
      console.error("Error fetching groups:", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  return { groups, loading, error, refetch: fetchGroups };
}

export function useAdminRoles() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const assignRole = useCallback(async (userId: string, role: AppRole) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_assign_role", {
        _user_id: userId,
        _role: role,
      });
      if (rpcError) throw rpcError;
      return data;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const removeRole = useCallback(async (userId: string, role: AppRole) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_remove_role", {
        _user_id: userId,
        _role: role,
      });
      if (rpcError) throw rpcError;
      return data;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { assignRole, removeRole, loading, error };
}
