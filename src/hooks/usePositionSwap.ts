import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface SwapRequest {
  id: string;
  group_id: string;
  requester_id: string;
  target_id: string;
  requester_position: number;
  target_position: number;
  status: string;
  created_at: string;
  responded_at: string | null;
  requester_profile?: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

export function usePositionSwap(groupId: string) {
  const { user } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<SwapRequest[]>([]);
  const [hasUsedSwap, setHasUsedSwap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const fetchSwapData = useCallback(async () => {
    if (!groupId || !user) return;

    try {
      setLoading(true);
      
      // Check if user has used their swap
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("has_used_swap")
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .single();

      setHasUsedSwap(membership?.has_used_swap || false);

      // Fetch pending swap requests where user is target
      const { data: requests, error } = await supabase
        .from("position_swap_requests")
        .select("*")
        .eq("group_id", groupId)
        .eq("target_id", user.id)
        .eq("status", "pending");

      if (error) throw error;

      // Fetch requester profiles
      if (requests && requests.length > 0) {
        const requesterIds = requests.map(r => r.requester_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url")
          .in("id", requesterIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const requestsWithProfiles = requests.map(r => ({
          ...r,
          requester_profile: profileMap.get(r.requester_id),
        }));

        setPendingRequests(requestsWithProfiles);
      } else {
        setPendingRequests([]);
      }
    } catch (err) {
      console.error("Error fetching swap data:", err);
    } finally {
      setLoading(false);
    }
  }, [groupId, user]);

  useEffect(() => {
    fetchSwapData();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`swap-requests-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "position_swap_requests",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          fetchSwapData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, fetchSwapData]);

  const requestSwap = async (targetUserId: string) => {
    if (!groupId || !user) return { success: false, error: "Not authenticated" };

    setRequesting(true);
    try {
      const { data, error } = await supabase.rpc("request_position_swap", {
        _group_id: groupId,
        _target_user_id: targetUserId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (result.success) {
        toast.success(result.message || "Swap request sent");
        return { success: true };
      } else {
        toast.error(result.error || "Failed to send swap request");
        return { success: false, error: result.error };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send swap request";
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setRequesting(false);
    }
  };

  const respondToSwap = async (requestId: string, accept: boolean) => {
    try {
      const { data, error } = await supabase.rpc("respond_to_swap_request", {
        _request_id: requestId,
        _accept: accept,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (result.success) {
        toast.success(result.message);
        await fetchSwapData();
        return { success: true };
      } else {
        toast.error(result.error || "Failed to respond to swap request");
        return { success: false, error: result.error };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to respond to swap request";
      toast.error(message);
      return { success: false, error: message };
    }
  };

  return {
    pendingRequests,
    hasUsedSwap,
    loading,
    requesting,
    requestSwap,
    respondToSwap,
    refetch: fetchSwapData,
  };
}
