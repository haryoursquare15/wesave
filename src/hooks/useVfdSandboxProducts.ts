import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export function useVfdSandboxProducts() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const invoke = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      const accessToken = session?.access_token;
      if (!accessToken) {
        toast({ title: "Not authenticated", variant: "destructive" });
        return null;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("vfd-sandbox-products", {
          body: { action, ...body },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          return null;
        }

        if (data?.error) {
          toast({ title: "Error", description: data.error, variant: "destructive" });
          return null;
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({ title: "Request failed", description: message, variant: "destructive" });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token, toast]
  );

  // Thrift Groups (full parity)
  const createGroup = useCallback((body: Record<string, unknown>) => invoke("create_group", body), [invoke]);
  const listGroups = useCallback(() => invoke("list_groups"), [invoke]);
  const joinGroup = useCallback((group_id: string) => invoke("join_group", { group_id }), [invoke]);
  const commenceGroup = useCallback((group_id: string) => invoke("commence_group", { group_id }), [invoke]);
  const contributeGroup = useCallback((group_id: string) => invoke("contribute_group", { group_id }), [invoke]);
  const getGroupDetail = useCallback((group_id: string) => invoke("get_group_detail", { group_id }), [invoke]);
  const requestSwap = useCallback((group_id: string, target_id: string) => invoke("request_swap", { group_id, target_id }), [invoke]);
  const respondSwap = useCallback((swap_id: string, accept: boolean) => invoke("respond_swap", { swap_id, accept }), [invoke]);
  const exitGroup = useCallback((group_id: string) => invoke("exit_group", { group_id }), [invoke]);
  const restartGroup = useCallback((group_id: string, terms_accepted: boolean) => invoke("restart_group", { group_id, terms_accepted }), [invoke]);

  // Target Ajo
  const createTarget = useCallback((body: Record<string, unknown>) => invoke("create_target", body), [invoke]);
  const listTargets = useCallback(() => invoke("list_targets"), [invoke]);
  const contributeTarget = useCallback((target_id: string) => invoke("contribute_target", { target_id }), [invoke]);
  const getTargetDetail = useCallback((target_id: string) => invoke("get_target_detail", { target_id }), [invoke]);

  // Goal Funding
  const createCampaign = useCallback((body: Record<string, unknown>) => invoke("create_campaign", body), [invoke]);
  const listCampaigns = useCallback(() => invoke("list_campaigns"), [invoke]);
  const contributeCampaign = useCallback((campaign_id: string, amount: number, anonymous?: boolean, message?: string) =>
    invoke("contribute_campaign", { campaign_id, amount, anonymous, message }), [invoke]);

  // SplitPay
  const createSplit = useCallback((body: Record<string, unknown>) => invoke("create_split", body), [invoke]);
  const listSplits = useCallback(() => invoke("list_splits"), [invoke]);
  const joinSplit = useCallback((split_id: string) => invoke("join_split", { split_id }), [invoke]);
  const paySplit = useCallback((split_id: string) => invoke("pay_split", { split_id }), [invoke]);

  return {
    loading,
    // Thrift Groups
    createGroup, listGroups, joinGroup, commenceGroup, contributeGroup, getGroupDetail,
    requestSwap, respondSwap, exitGroup, restartGroup,
    // Target Ajo
    createTarget, listTargets, contributeTarget, getTargetDetail,
    // Goal Funding
    createCampaign, listCampaigns, contributeCampaign,
    // SplitPay
    createSplit, listSplits, joinSplit, paySplit,
  };
}
