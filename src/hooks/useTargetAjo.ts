import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TargetAjoGroup {
  id: string;
  name: string;
  description: string | null;
  target_amount: number;
  amount_raised: number;
  contribution_amount: number;
  frequency: string;
  target_date: string | null;
  reason: string | null;
  admin_user_id: string;
  status: string;
  member_count: number;
  max_members: number;
  savings_type: "group" | "independent";
  created_at: string;
  updated_at: string;
}

export interface TargetAjoMemberContribution {
  id: string;
  group_id: string;
  user_id: string;
  total_contributed: number;
  updated_at: string;
}

export interface TargetAjoMembership {
  id: string;
  group_id: string;
  user_id: string;
  status: string;
  joined_at: string;
}

export interface TargetAjoContribution {
  id: string;
  group_id: string;
  user_id: string;
  amount: number;
  contribution_date: string;
  source: string;
  reference: string | null;
  status: string;
  created_at: string;
}

export interface TargetAjoWithdrawalRequest {
  id: string;
  group_id: string;
  requested_by: string;
  amount: number;
  reason: string | null;
  status: string;
  required_votes: number;
  approval_count: number;
  rejection_count: number;
  created_at: string;
  resolved_at: string | null;
}

export interface TargetAjoVote {
  id: string;
  withdrawal_request_id: string;
  user_id: string;
  vote: string;
  created_at: string;
}

export interface TargetAjoInvite {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
  status: string;
  created_at: string;
  responded_at: string | null;
}

export function useTargetAjoGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<TargetAjoGroup[]>([]);
  const [myGroups, setMyGroups] = useState<TargetAjoGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("target_ajo_groups")
        .select("*")
        .in("status", ["active", "completed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGroups(data || []);

      if (user) {
        // Get groups where user is admin or member
        const { data: memberships } = await (supabase as any)
          .from("target_ajo_memberships")
          .select("group_id")
          .eq("user_id", user.id)
          .eq("status", "active");

        const memberGroupIds = (memberships || []).map((m: any) => m.group_id);
        
        const mine = (data || []).filter(
          (g: TargetAjoGroup) => g.admin_user_id === user.id || memberGroupIds.includes(g.id)
        );
        setMyGroups(mine);
      }
    } catch (err) {
      console.error("Error fetching target ajo groups:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  return { groups, myGroups, loading, refetch: fetchGroups };
}

export function useTargetAjoDetail(groupId: string | undefined) {
  const { user } = useAuth();
  const [group, setGroup] = useState<TargetAjoGroup | null>(null);
  const [members, setMembers] = useState<TargetAjoMembership[]>([]);
  const [contributions, setContributions] = useState<TargetAjoContribution[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<TargetAjoWithdrawalRequest[]>([]);
  const [votes, setVotes] = useState<TargetAjoVote[]>([]);
  const [invites, setInvites] = useState<TargetAjoInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!groupId) return;
    try {
      const { data: g, error } = await (supabase as any)
        .from("target_ajo_groups")
        .select("*")
        .eq("id", groupId)
        .single();
      if (error) throw error;
      setGroup(g);
      setIsAdmin(user?.id === g?.admin_user_id);

      const { data: mems } = await (supabase as any)
        .from("target_ajo_memberships")
        .select("*")
        .eq("group_id", groupId)
        .eq("status", "active");
      setMembers(mems || []);
      setIsMember((mems || []).some((m: any) => m.user_id === user?.id) || user?.id === g?.admin_user_id);

      const { data: contribs } = await (supabase as any)
        .from("target_ajo_contributions")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      setContributions(contribs || []);

      const { data: wrs } = await (supabase as any)
        .from("target_ajo_withdrawal_requests")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      setWithdrawalRequests(wrs || []);

      if (wrs && wrs.length > 0) {
        const wrIds = wrs.map((w: any) => w.id);
        const { data: v } = await (supabase as any)
          .from("target_ajo_withdrawal_votes")
          .select("*")
          .in("withdrawal_request_id", wrIds);
        setVotes(v || []);
      }

      const { data: inv } = await (supabase as any)
        .from("target_ajo_invites")
        .select("*")
        .eq("group_id", groupId);
      setInvites(inv || []);
    } catch (err) {
      console.error("Error fetching target ajo detail:", err);
    } finally {
      setLoading(false);
    }
  }, [groupId, user]);

  useEffect(() => {
    fetchDetail();

    if (!groupId) return;

    const contribChannel = supabase
      .channel(`target-ajo-contribs-${groupId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "target_ajo_contributions",
        filter: `group_id=eq.${groupId}`,
      }, () => fetchDetail())
      .subscribe();

    const voteChannel = supabase
      .channel(`target-ajo-votes-${groupId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "target_ajo_withdrawal_votes",
      }, () => fetchDetail())
      .subscribe();

    const wrChannel = supabase
      .channel(`target-ajo-wr-${groupId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "target_ajo_withdrawal_requests",
        filter: `group_id=eq.${groupId}`,
      }, () => fetchDetail())
      .subscribe();

    return () => {
      supabase.removeChannel(contribChannel);
      supabase.removeChannel(voteChannel);
      supabase.removeChannel(wrChannel);
    };
  }, [fetchDetail, groupId]);

  return { group, members, contributions, withdrawalRequests, votes, invites, loading, isAdmin, isMember, refetch: fetchDetail };
}

export function useTargetAjoInvites() {
  const { user } = useAuth();
  const [pendingInvites, setPendingInvites] = useState<(TargetAjoInvite & { group_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvites = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await (supabase as any)
        .from("target_ajo_invites")
        .select("*")
        .eq("invitee_id", user.id)
        .eq("status", "pending");

      if (data && data.length > 0) {
        const groupIds = data.map((i: any) => i.group_id);
        const { data: groups } = await (supabase as any)
          .from("target_ajo_groups")
          .select("id, name")
          .in("id", groupIds);

        const enriched = data.map((inv: any) => ({
          ...inv,
          group_name: groups?.find((g: any) => g.id === inv.group_id)?.name || "Unknown",
        }));
        setPendingInvites(enriched);
      } else {
        setPendingInvites([]);
      }
    } catch (err) {
      console.error("Error fetching target ajo invites:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  return { pendingInvites, loading, refetch: fetchInvites };
}
