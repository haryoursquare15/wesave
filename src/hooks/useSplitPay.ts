import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SplitRequest {
  id: string;
  creator_user_id: string;
  total_amount: number;
  number_of_people: number;
  amount_per_person: number;
  merchant_account_name: string;
  merchant_bank_name: string;
  merchant_account_number: string;
  purpose: string;
  status: string;
  platform_fee: number;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
  settlement_status: string | null;
  settlement_reference: string | null;
  settlement_completed_at: string | null;
  settlement_failure_reason: string | null;
}

export interface SplitParticipant {
  id: string;
  split_request_id: string;
  user_id: string;
  amount_due: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  profile?: { full_name: string | null; username: string | null; avatar_url: string | null };
}

export interface SplitTransaction {
  id: string;
  split_request_id: string;
  user_id: string;
  amount: number;
  wallet_ledger_id: string | null;
  status: string;
  created_at: string;
}

export function useSplitRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<SplitRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("split_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setRequests((data as SplitRequest[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Realtime: refresh when split_requests or split_participants change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("split-requests-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "split_requests" }, () => fetchRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "split_participants" }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchRequests]);

  return { requests, loading, refetch: fetchRequests };
}

export function useSplitRequestDetail(requestId: string | undefined) {
  const { user } = useAuth();
  const [request, setRequest] = useState<SplitRequest | null>(null);
  const [participants, setParticipants] = useState<SplitParticipant[]>([]);
  const [transactions, setTransactions] = useState<SplitTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorProfile, setCreatorProfile] = useState<{ full_name: string | null; username: string | null } | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!user || !requestId) return;
    setLoading(true);

    const [reqRes, partRes, txRes] = await Promise.all([
      supabase.from("split_requests").select("*").eq("id", requestId).single(),
      supabase.from("split_participants").select("*").eq("split_request_id", requestId),
      supabase.from("split_transactions").select("*").eq("split_request_id", requestId).order("created_at", { ascending: false }),
    ]);

    const reqData = reqRes.data as SplitRequest | null;
    setRequest(reqData);
    setTransactions((txRes.data as SplitTransaction[]) || []);

    // Fetch participant profiles using SECURITY DEFINER RPC (bypasses profile RLS)
    const parts = (partRes.data as SplitParticipant[]) || [];
    if (parts.length > 0) {
      const userIds = parts.map((p) => p.user_id);
      const { data: profiles } = await supabase.rpc("get_public_profiles", { user_ids: userIds });

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, { 
        full_name: p.full_name, 
        username: p.username, 
        avatar_url: p.avatar_url 
      }]));
      const enriched = parts.map((p) => ({
        ...p,
        profile: profileMap.get(p.user_id) || null,
      }));
      setParticipants(enriched);
    } else {
      setParticipants([]);
    }

    // Fetch creator profile using SECURITY DEFINER RPC
    if (reqData) {
      const { data: cpArr } = await supabase.rpc("get_public_profiles", { user_ids: [reqData.creator_user_id] });
      const cp = cpArr && cpArr.length > 0 ? cpArr[0] : null;
      setCreatorProfile(cp ? { full_name: cp.full_name, username: cp.username } : null);
    }

    setLoading(false);
  }, [user, requestId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Realtime subscriptions
  useEffect(() => {
    if (!requestId) return;
    const channel = supabase
      .channel(`split-detail-${requestId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "split_participants", filter: `split_request_id=eq.${requestId}` }, () => fetchDetail())
      .on("postgres_changes", { event: "*", schema: "public", table: "split_transactions", filter: `split_request_id=eq.${requestId}` }, () => fetchDetail())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [requestId, fetchDetail]);

  const activeParticipants = participants.filter((p) => p.status !== "declined");
  const isGroupComplete = activeParticipants.length >= (request?.number_of_people ?? 0);

  const payShare = useCallback(async () => {
    if (!user || !request) {
      console.error("[SplitPay] payShare blocked: user or request missing", { user: !!user, request: !!request });
      return { success: false, error: "Not ready" };
    }

    // Re-fetch participants fresh to avoid stale closure
    const { data: freshParts, error: partError } = await supabase
      .from("split_participants")
      .select("*")
      .eq("split_request_id", request.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (partError || !freshParts) {
      console.error("[SplitPay] Could not find participant record", { partError, userId: user.id, requestId: request.id });
      return { success: false, error: "You are not a participant in this split" };
    }

    const amountDue = Number(freshParts.amount_due);
    console.log("[SplitPay] Calling process_split_payment", { 
      requestId: request.id, userId: user.id, amount: amountDue 
    });

    const { data, error } = await supabase.rpc("process_split_payment", {
      _split_request_id: request.id,
      _user_id: user.id,
      _amount: amountDue,
    });

    console.log("[SplitPay] RPC response", { data, error });

    if (error) {
      console.error("[SplitPay] RPC error", error);
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string; all_paid?: boolean; paid_count?: number; required_count?: number };

    // If all participants have paid, trigger receipt emails
    if (result.success && result.all_paid) {
      supabase.functions.invoke("splitpay-receipt", {
        body: { split_request_id: request.id },
      }).catch((err) => console.error("Receipt email trigger failed:", err));
    }

    return result;
  }, [user, request, participants]);

  const declineShare = useCallback(async () => {
    if (!user || !request) return { success: false, error: "Not ready" };
    const { data, error } = await supabase.rpc("decline_split_participation", {
      _split_request_id: request.id,
      _user_id: user.id,
    });
    if (error) {
      console.error("Decline failed:", error.message);
      return { success: false, error: error.message };
    }
    const result = data as { success: boolean; error?: string };
    // Refetch to update participant list
    await fetchDetail();
    return result;
  }, [user, request, fetchDetail]);

  const cancelRequest = useCallback(async () => {
    if (!user || !request) return { success: false, error: "Not ready" };
    if (request.creator_user_id !== user.id) return { success: false, error: "Only the creator can cancel" };
    
    const { data, error } = await supabase.rpc("cancel_split_request" as any, {
      _split_request_id: request.id,
      _creator_id: user.id,
    } as any);
    
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string; refunded_count?: number };
    if (result.success) await fetchDetail();
    return result;
  }, [user, request, fetchDetail]);

  const removeParticipant = useCallback(async (participantUserId: string) => {
    if (!user || !request) return { success: false, error: "Not ready" };
    const { data, error } = await supabase.rpc("remove_split_participant", {
      _split_request_id: request.id,
      _creator_id: user.id,
      _participant_user_id: participantUserId,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    if (result.success) await fetchDetail();
    return result;
  }, [user, request, fetchDetail]);

  return { request, participants, transactions, creatorProfile, loading, isGroupComplete, payShare, declineShare, cancelRequest, removeParticipant, refetch: fetchDetail };
}
