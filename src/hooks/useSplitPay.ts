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

    // Fetch participant profiles
    const parts = (partRes.data as SplitParticipant[]) || [];
    if (parts.length > 0) {
      const userIds = parts.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const enriched = parts.map((p) => ({
        ...p,
        profile: profileMap.get(p.user_id) || null,
      }));
      setParticipants(enriched);
    } else {
      setParticipants([]);
    }

    // Fetch creator profile
    if (reqData) {
      const { data: cp } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", reqData.creator_user_id)
        .single();
      setCreatorProfile(cp as any);
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

  const payShare = useCallback(async () => {
    if (!user || !request) return { success: false, error: "Not ready" };
    const participant = participants.find((p) => p.user_id === user.id);
    if (!participant) return { success: false, error: "You are not a participant" };

    const { data, error } = await supabase.rpc("process_split_payment", {
      _split_request_id: request.id,
      _user_id: user.id,
      _amount: participant.amount_due,
    });
    if (error) return { success: false, error: error.message };

    const result = data as { success: boolean; error?: string; all_paid?: boolean };

    // If all participants have paid, trigger receipt emails
    if (result.success && result.all_paid) {
      supabase.functions.invoke("splitpay-receipt", {
        body: { split_request_id: request.id },
      }).catch((err) => console.error("Receipt email trigger failed:", err));
    }

    return result;
  }, [user, request, participants]);

  const declineShare = useCallback(async () => {
    if (!user || !request) return;
    await supabase
      .from("split_participants")
      .update({ status: "declined" })
      .eq("split_request_id", request.id)
      .eq("user_id", user.id);
  }, [user, request]);

  const cancelRequest = useCallback(async () => {
    if (!user || !request) return;
    if (request.creator_user_id !== user.id) return;
    await supabase
      .from("split_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", request.id);
  }, [user, request]);

  return { request, participants, transactions, creatorProfile, loading, payShare, declineShare, cancelRequest, refetch: fetchDetail };
}
