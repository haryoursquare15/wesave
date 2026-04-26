import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface GoalCampaign {
  id: string;
  campaign_title: string;
  description: string | null;
  goal_amount: number;
  amount_raised: number;
  campaign_owner_user_id: string;
  beneficiary_account_name: string | null;
  beneficiary_bank_name: string | null;
  beneficiary_account_number: string | null;
  campaign_image: string | null;
  campaign_status: string;
  created_at: string;
  updated_at: string;
  campaign_deadline: string | null;
  campaign_slug: string | null;
  contribution_visibility: string;
  contributor_count: number;
}

export interface GoalContribution {
  id: string;
  campaign_id: string;
  contributor_user_id: string;
  contributor_name: string | null;
  contribution_amount: number;
  contribution_reference: string | null;
  contribution_status: string;
  anonymous: boolean;
  created_at: string;
}

export interface CampaignUpdate {
  id: string;
  campaign_id: string;
  update_message: string;
  created_by: string;
  created_at: string;
}

export function useGoalCampaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<GoalCampaign[]>([]);
  const [myCampaigns, setMyCampaigns] = useState<GoalCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchCampaigns() {
    try {
      // Public list goes through SECURITY DEFINER RPC that omits beneficiary bank fields
      const { data, error } = await (supabase as any).rpc("get_public_goal_campaigns");

      if (error) throw error;
      const sorted = (data || []).sort((a: GoalCampaign, b: GoalCampaign) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setCampaigns(sorted);

      if (user) {
        // Owner queries directly — RLS still allows campaign_owner_user_id = auth.uid()
        const { data: mine } = await (supabase as any)
          .from("goal_campaigns")
          .select("*")
          .eq("campaign_owner_user_id", user.id)
          .order("created_at", { ascending: false });
        setMyCampaigns(mine || []);
      }
    } catch (err) {
      console.error("Error fetching goal campaigns:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCampaigns();
  }, [user]);

  return { campaigns, myCampaigns, loading, refetch: fetchCampaigns };
}

export function useGoalCampaignDetail(campaignId: string | undefined) {
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<GoalCampaign | null>(null);
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [updates, setUpdates] = useState<CampaignUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  async function fetchDetail() {
    if (!campaignId) return;
    try {
      const { data: c, error } = await (supabase as any)
        .from("goal_campaigns")
        .select("*")
        .eq("id", campaignId)
        .single();

      if (error) throw error;
      setCampaign(c);
      setIsOwner(user?.id === c?.campaign_owner_user_id);

      const { data: contribs } = await (supabase as any)
        .from("goal_contributions")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      setContributions(contribs || []);

      const { data: upds } = await (supabase as any)
        .from("campaign_updates")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      setUpdates(upds || []);
    } catch (err) {
      console.error("Error fetching campaign detail:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDetail();

    if (!campaignId) return;

    // Realtime subscriptions
    const contribChannel = supabase
      .channel(`goal-contribs-${campaignId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "goal_contributions",
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { fetchDetail(); })
      .subscribe();

    const updateChannel = supabase
      .channel(`goal-updates-${campaignId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "campaign_updates",
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { fetchDetail(); })
      .subscribe();

    return () => {
      supabase.removeChannel(contribChannel);
      supabase.removeChannel(updateChannel);
    };
  }, [campaignId, user]);

  return { campaign, contributions, updates, loading, isOwner, refetch: fetchDetail };
}
