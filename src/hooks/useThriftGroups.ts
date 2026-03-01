import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";

type ThriftGroup = Tables<"thrift_groups">;

interface GroupWithMemberInfo extends ThriftGroup {
  memberCount: number;
  pendingRequests: number;
  isMember: boolean;
}

export function useMyGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupWithMemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!user) {
      setGroups([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Fetch groups where user is a member
      const { data: memberships, error: membershipError } = await supabase
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (membershipError) throw membershipError;

      if (!memberships || memberships.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const groupIds = memberships.map(m => m.group_id);

      // Fetch group details - sort by newest first
      const { data: groupsData, error: groupsError } = await supabase
        .from("thrift_groups")
        .select("*")
        .in("id", groupIds)
        .order("created_at", { ascending: false });

      if (groupsError) throw groupsError;

      // Fetch member counts and pending requests for each group
      const groupsWithInfo = await Promise.all(
        (groupsData || []).map(async (group) => {
          const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
            supabase
              .from("group_memberships")
              .select("*", { count: "exact", head: true })
              .eq("group_id", group.id)
              .eq("status", "active"),
            supabase
              .from("pending_join_requests")
              .select("*", { count: "exact", head: true })
              .eq("group_id", group.id)
              .eq("status", "pending"),
          ]);

          return {
            ...group,
            memberCount: memberCount || 0,
            pendingRequests: pendingCount || 0,
            isMember: true,
          };
        })
      );

      setGroups(groupsWithInfo);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Real-time: refresh when memberships change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("my-groups-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "group_memberships" }, () => {
        fetchGroups();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "thrift_groups" }, () => {
        fetchGroups();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchGroups]);

  return { groups, loading, error, refetch: fetchGroups };
}

export function usePoolGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupWithMemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch groups from pool view (active/completed) AND pending groups that need more members
      const [poolResult, pendingResult] = await Promise.all([
        supabase.from("public_groups").select("*"),
        // Also fetch pending groups that haven't reached max members - newest first
        supabase
          .from("thrift_groups")
          .select("id, name, max_members, contribution_amount, period, status, rating, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      ]);

      if (poolResult.error) throw poolResult.error;

      // Get user's memberships to mark which ones they're in
      let userGroupIds: string[] = [];
      if (user) {
        const { data: memberships } = await supabase
          .from("group_memberships")
          .select("group_id")
          .eq("user_id", user.id)
          .eq("status", "active");
        
        userGroupIds = memberships?.map(m => m.group_id) || [];
      }

      // Process pool groups
      const poolGroups = (poolResult.data || []).map(group => ({
        id: group.id!,
        name: group.name!,
        description: null,
        max_members: group.max_members!,
        contribution_amount: group.contribution_amount!,
        period: group.period!,
        auto_debit: true,
        admin_id: "",
        status: group.status!,
        rating: group.rating,
        current_cycle: 1,
        invite_code: null,
        created_at: null,
        updated_at: null,
        flw_subaccount_id: null,
        payout_order: [],
        current_payout_position: 0,
        next_contribution_date: null,
        next_payout_date: null,
        contribution_day_of_month: null,
        contribution_day_of_week: null,
        contribution_hour: 9,
        contribution_minute: 0,
        memberCount: Number(group.member_count) || 0,
        pendingRequests: Number(group.pending_requests) || 0,
        isMember: userGroupIds.includes(group.id!),
      }));

      // Fetch member counts for pending groups
      const pendingGroupsWithInfo = await Promise.all(
        (pendingResult.data || []).map(async (group) => {
          const { count } = await supabase
            .from("group_memberships")
            .select("*", { count: "exact", head: true })
            .eq("group_id", group.id)
            .eq("status", "active");

          const memberCount = count || 0;

          // Only include groups that need more members (not yet full)
          if (memberCount >= group.max_members) return null;

          return {
            id: group.id,
            name: group.name,
            description: null,
            max_members: group.max_members,
            contribution_amount: group.contribution_amount,
            period: group.period,
            auto_debit: true,
            admin_id: "",
            status: group.status,
            rating: group.rating,
            current_cycle: 1,
            invite_code: null,
            created_at: (group as unknown as { created_at: string | null }).created_at,
            updated_at: null,
            flw_subaccount_id: null,
            payout_order: [],
            current_payout_position: 0,
            next_contribution_date: null,
            next_payout_date: null,
            contribution_day_of_month: null,
            contribution_day_of_week: null,
            contribution_hour: 9,
            contribution_minute: 0,
            memberCount,
            pendingRequests: 0,
            isMember: userGroupIds.includes(group.id),
          };
        })
      );

      // Filter out nulls and already present groups
      const validPendingGroups = pendingGroupsWithInfo.filter(
        (g): g is NonNullable<typeof g> => g !== null
      );

      // Combine and remove duplicates (some pending might also be in public_groups)
      const poolGroupIds = new Set(poolGroups.map(g => g.id));
      const uniquePendingGroups = validPendingGroups.filter(g => !poolGroupIds.has(g.id));

      // Combine all groups and sort by created_at DESC (newest first)
      const allGroups = [...poolGroups, ...uniquePendingGroups].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      setGroups(allGroups);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Real-time: refresh when memberships or groups change
  useEffect(() => {
    const channel = supabase
      .channel("pool-groups-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "group_memberships" }, () => {
        fetchGroups();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "thrift_groups" }, () => {
        fetchGroups();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_join_requests" }, () => {
        fetchGroups();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchGroups]);

  return { groups, loading, error, refetch: fetchGroups };
}

export function useCreateGroup() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createGroup = async (data: {
    name: string;
    maxMembers: number;
    contributionAmount: number;
    period: "daily" | "weekly" | "monthly";
    autoDebit: boolean;
    contributionHour?: number;
    contributionMinute?: number;
    contributionDayOfWeek?: number;
    contributionDayOfMonth?: number;
  }) => {
    // Auth context can lag behind the actual auth session (especially right after sign-in/reset).
    // Always rely on the current session for critical writes.
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw new Error(sessionError.message || "Unable to verify your session");
    }

    const effectiveUserId = session?.user?.id ?? user?.id;
    if (!effectiveUserId) {
      throw new Error("Your session has expired. Please sign in again and retry.");
    }

    setLoading(true);
    setError(null);

    try {
      // Prepare schedule parameters based on period
      let dayOfWeek = 1;
      let dayOfMonth = 1;
      
      if (data.period === "weekly") {
        dayOfWeek = data.contributionDayOfWeek ?? 1;
      } else if (data.period === "monthly") {
        dayOfMonth = data.contributionDayOfMonth ?? 1;
      }

      // Use the RPC function with all parameters
      const { data: group, error: rpcError } = await supabase
        .rpc("create_thrift_group", {
          _name: data.name,
          _max_members: data.maxMembers,
          _contribution_amount: data.contributionAmount,
          _period: data.period,
          _auto_debit: data.autoDebit,
          _contribution_hour: data.contributionHour ?? 9,
          _contribution_minute: data.contributionMinute ?? 0,
          _contribution_day_of_week: dayOfWeek,
          _contribution_day_of_month: dayOfMonth,
        });

      if (rpcError) {
        throw new Error(rpcError.message || "Failed to create group");
      }

      if (!group) {
        throw new Error("Group creation succeeded but no group was returned.");
      }

      return group;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createGroup, loading, error };
}
