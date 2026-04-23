import { useState, useCallback } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";

export function useVfdSandboxProducts() {
  const { session, client } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const invoke = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      // Always fetch a fresh session so we never send an expired JWT.
      // supabase-js auto-refreshes the token if it's expired.
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        toast({ title: "Not authenticated", description: "Please sign in again.", variant: "destructive" });
        return null;
      }

      setLoading(true);
      try {
        const { data, error } = await client.functions.invoke("vfd-sandbox-products", {
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
    [client, toast]
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
  const confirmContinue = useCallback((group_id: string) => invoke("confirm_continue", { group_id }), [invoke]);
  const restartGroup = useCallback((group_id: string, terms_accepted: boolean) => invoke("restart_group", { group_id, terms_accepted }), [invoke]);
  const searchUsers = useCallback((query: string) => invoke("search_users", { query }), [invoke]);
  const inviteGroupMember = useCallback((group_id: string, invitee_id: string) => invoke("invite_group_member", { group_id, invitee_id }), [invoke]);
  const respondGroupInvite = useCallback((invite_id: string, accept: boolean) => invoke("respond_group_invite", { invite_id, accept }), [invoke]);
  const createGroupInviteLink = useCallback((group_id: string) => invoke("create_group_invite_link", { group_id }), [invoke]);
  const validateGroupInviteLink = useCallback((token: string) => invoke("validate_group_invite_link", { token }), [invoke]);
  const joinGroupViaLink = useCallback((token: string) => invoke("join_group_via_link", { token }), [invoke]);
  const listGroupInvites = useCallback(() => invoke("list_group_invites"), [invoke]);
  const listPendingGroupInvitees = useCallback((group_id: string) => invoke("list_pending_group_invitees", { group_id }), [invoke]);

  // In-app Notifications
  const listNotifications = useCallback(() => invoke("list_notifications"), [invoke]);
  const markNotificationRead = useCallback((notification_id: string) => invoke("mark_notification_read", { notification_id }), [invoke]);
  const markAllNotificationsRead = useCallback(() => invoke("mark_all_notifications_read"), [invoke]);

  // Target Ajo (full parity)
  const createTarget = useCallback((body: Record<string, unknown>) => invoke("create_target", body), [invoke]);
  const listTargets = useCallback(() => invoke("list_targets"), [invoke]);
  const contributeTarget = useCallback((target_id: string) => invoke("contribute_target", { target_id }), [invoke]);
  const getTargetDetail = useCallback((target_id: string) => invoke("get_target_detail", { target_id }), [invoke]);
  const inviteTargetMember = useCallback((target_id: string, invitee_id: string) => invoke("invite_target_member", { target_id, invitee_id }), [invoke]);
  const respondTargetInvite = useCallback((invite_id: string, accept: boolean) => invoke("respond_target_invite", { invite_id, accept }), [invoke]);
  const requestTargetWithdrawal = useCallback((target_id: string, amount: number, reason?: string) =>
    invoke("request_target_withdrawal", { target_id, amount, reason }), [invoke]);
  const voteTargetWithdrawal = useCallback((request_id: string, vote: string) =>
    invoke("vote_target_withdrawal", { request_id, vote }), [invoke]);
  const independentWithdrawal = useCallback((target_id: string) => invoke("independent_withdrawal", { target_id }), [invoke]);

  // Goal Funding (full parity)
  const createCampaign = useCallback((body: Record<string, unknown>) => invoke("create_campaign", body), [invoke]);
  const listCampaigns = useCallback(() => invoke("list_campaigns"), [invoke]);
  const contributeCampaign = useCallback((campaign_id: string, amount: number, anonymous?: boolean, message?: string, contributor_name?: string) =>
    invoke("contribute_campaign", { campaign_id, amount, anonymous, message, contributor_name }), [invoke]);
  const getCampaignDetail = useCallback((campaign_id: string) => invoke("get_campaign_detail", { campaign_id }), [invoke]);
  const postCampaignUpdate = useCallback((campaign_id: string, update_message: string) =>
    invoke("post_campaign_update", { campaign_id, update_message }), [invoke]);

  // SplitPay (full parity)
  const createSplit = useCallback((body: Record<string, unknown>) => invoke("create_split", body), [invoke]);
  const listSplits = useCallback(() => invoke("list_splits"), [invoke]);
  const joinSplit = useCallback((split_id: string) => invoke("join_split", { split_id }), [invoke]);
  const paySplit = useCallback((split_id: string) => invoke("pay_split", { split_id }), [invoke]);
  const declineSplit = useCallback((split_id: string) => invoke("decline_split", { split_id }), [invoke]);
  const cancelSplit = useCallback((split_id: string) => invoke("cancel_split", { split_id }), [invoke]);
  const removeSplitParticipant = useCallback((split_id: string, participant_user_id: string) =>
    invoke("remove_split_participant", { split_id, participant_user_id }), [invoke]);
  const getSplitDetail = useCallback((split_id: string) => invoke("get_split_detail", { split_id }), [invoke]);

  // Associations (full parity)
  const createAssociation = useCallback((body: Record<string, unknown>) => invoke("create_association", body), [invoke]);
  const listAssociations = useCallback(() => invoke("list_associations"), [invoke]);
  const joinAssociation = useCallback((association_id: string, role?: "member" | "exco") => invoke("join_association", { association_id, role }), [invoke]);
  const getAssociationDetail = useCallback((association_id: string) => invoke("get_association_detail", { association_id }), [invoke]);
  const contributeAssociation = useCallback((association_id: string, amount: number, narration?: string) =>
    invoke("contribute_association", { association_id, amount, narration }), [invoke]);
  const inviteAssocMember = useCallback((association_id: string, invitee_id: string) =>
    invoke("invite_assoc_member", { association_id, invitee_id }), [invoke]);
  const respondAssocInvite = useCallback((invite_id: string, accept: boolean, role?: "member" | "exco") =>
    invoke("respond_assoc_invite", { invite_id, accept, role }), [invoke]);
  const listAssocChat = useCallback((association_id: string) => invoke("list_assoc_chat", { association_id }), [invoke]);
  const postAssocChat = useCallback((association_id: string, message: string) =>
    invoke("post_assoc_chat", { association_id, message }), [invoke]);
  const adminListPendingAssoc = useCallback(() => invoke("admin_list_pending_assoc"), [invoke]);
  const adminReviewAssoc = useCallback((association_id: string, decision: "approve" | "reject", reason?: string) =>
    invoke("admin_review_assoc", { association_id, decision, reason }), [invoke]);
  const adminAssocDocUrl = useCallback((path: string) => invoke("admin_assoc_doc_url", { path }), [invoke]);

  // Virtual Cards
  const createVirtualCard = useCallback(() => invoke("create_virtual_card"), [invoke]);
  const activateCard = useCallback((card_id: string) => invoke("activate_card", { card_id }), [invoke]);
  const cardPinChange = useCallback((card_id: string, old_pin: string, new_pin: string) =>
    invoke("card_pin_change", { card_id, old_pin, new_pin }), [invoke]);
  const blockCard = useCallback((card_id: string) => invoke("block_card", { card_id }), [invoke]);
  const unblockCard = useCallback((card_id: string) => invoke("unblock_card", { card_id }), [invoke]);
  const getCards = useCallback(() => invoke("get_cards"), [invoke]);
  const getCardDetails = useCallback((card_id: string) => invoke("get_card_details", { card_id }), [invoke]);

  return {
    loading,
    invoke,
    // Thrift Groups
    createGroup, listGroups, joinGroup, commenceGroup, contributeGroup, getGroupDetail,
    requestSwap, respondSwap, exitGroup, confirmContinue, restartGroup,
    searchUsers, inviteGroupMember, respondGroupInvite, createGroupInviteLink, validateGroupInviteLink, joinGroupViaLink, listGroupInvites, listPendingGroupInvitees,
    // Notifications
    listNotifications, markNotificationRead, markAllNotificationsRead,
    // Target Ajo
    createTarget, listTargets, contributeTarget, getTargetDetail,
    inviteTargetMember, respondTargetInvite,
    requestTargetWithdrawal, voteTargetWithdrawal, independentWithdrawal,
    // Goal Funding
    createCampaign, listCampaigns, contributeCampaign, getCampaignDetail, postCampaignUpdate,
    // SplitPay
    createSplit, listSplits, joinSplit, paySplit,
    declineSplit, cancelSplit, removeSplitParticipant, getSplitDetail,
    // Associations
    createAssociation, listAssociations, joinAssociation, getAssociationDetail, contributeAssociation,
    inviteAssocMember, respondAssocInvite, listAssocChat, postAssocChat,
    adminListPendingAssoc, adminReviewAssoc, adminAssocDocUrl,
    // Virtual Cards
    createVirtualCard, activateCard, cardPinChange, blockCard, unblockCard, getCards, getCardDetails,
  };
}
