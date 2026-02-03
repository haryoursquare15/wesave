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

      // Fetch group details
      const { data: groupsData, error: groupsError } = await supabase
        .from("thrift_groups")
        .select("*")
        .in("id", groupIds);

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
      
      // Fetch active/completed groups from pool view
      const { data: poolGroups, error: poolError } = await supabase
        .from("public_groups")
        .select("*");

      if (poolError) throw poolError;

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

      const groupsWithInfo = (poolGroups || []).map(group => ({
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
        memberCount: Number(group.member_count) || 0,
        pendingRequests: Number(group.pending_requests) || 0,
        isMember: userGroupIds.includes(group.id!),
      }));

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
      // Use the RPC function to bypass RLS insert issues
      const { data: group, error: rpcError } = await supabase
        .rpc("create_thrift_group", {
          _name: data.name,
          _max_members: data.maxMembers,
          _contribution_amount: data.contributionAmount,
          _period: data.period,
          _auto_debit: data.autoDebit,
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
