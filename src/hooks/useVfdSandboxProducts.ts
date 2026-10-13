import { useState, useCallback } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";

import { getUserFriendlyError } from "@/lib/errorMessages";
import { GATEWAY_STATUSES, PRODUCTS_UNAVAILABLE_MESSAGE, isRetrySafe, retryDelay } from "@/lib/productsRetry";
export function useVfdSandboxProducts() {
  const { session, client } = useSandboxAwareAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const invoke = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      // Always fetch a fresh session so we never send an expired JWT.
      // Proactively refresh if the token is within 60s of expiry (or already expired)
      // because supabase-js's lazy refresh can lag behind click-driven actions.
      let { data: sessionData } = await client.auth.getSession();
      let accessToken = sessionData?.session?.access_token;
      const expiresAt = sessionData?.session?.expires_at ?? 0; // unix seconds
      const nowSec = Math.floor(Date.now() / 1000);
      if (!accessToken || expiresAt - nowSec < 60) {
        const { data: refreshed, error: refreshErr } = await client.auth.refreshSession();
        if (refreshErr || !refreshed?.session?.access_token) {
          toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
          return null;
        }
        accessToken = refreshed.session.access_token;
      }

      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
      const anonKey = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const url = `${supabaseUrl}/functions/v1/vfd-sandbox-products`;

      // Use direct fetch instead of supabase-js client.functions.invoke().
      // The SDK attaches an internal AbortSignal that can be aborted by
      // unrelated session refreshes / GoTrue events, surfacing as
      // "Failed to send a request to the Edge Function" / AbortError.
      // A direct fetch with one retry on transient network/abort errors
      // is significantly more reliable for click-driven actions like
      // accepting a group invite.
      const doFetch = async () => {
        return await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action, ...body }),
        });
      };

      setLoading(true);
      try {
        let resp: Response;
        try {
          resp = await doFetch();
        } catch (netErr) {
          // One automatic retry on transient network failure / abort.
          await new Promise((r) => setTimeout(r, 250));
          resp = await doFetch();
        }

        // Service briefly unavailable (start-up failure): retry only actions
        // that can't move money twice.
        if (GATEWAY_STATUSES.has(resp.status) && isRetrySafe(action, body)) {
          for (let i = 0; i < 2 && GATEWAY_STATUSES.has(resp.status); i++) {
            await retryDelay(i);
            try { resp = await doFetch(); } catch { /* keep last response */ }
          }
        }

        let data: any = null;
        const text = await resp.text();
        if (text) {
          try { data = JSON.parse(text); } catch { data = { error: text }; }
        }

        if (!resp.ok) {
          const msg = GATEWAY_STATUSES.has(resp.status)
            ? PRODUCTS_UNAVAILABLE_MESSAGE
            : data?.error || data?.message || `Request failed (${resp.status})`;
          toast({ title: "Error", description: getUserFriendlyError(msg), variant: "destructive" });
          return { error: msg, status: resp.status };
        }

        if (data?.error) {
          toast({ title: "Error", description: getUserFriendlyError(data.error), variant: "destructive" });
          return data;
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({ title: "Request failed", description: message, variant: "destructive" });
        return { error: message };
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
  const deleteGroup = useCallback((group_id: string) => invoke("delete_group", { group_id }), [invoke]);
  const confirmContinue = useCallback((group_id: string) => invoke("confirm_continue", { group_id }), [invoke]);
  const restartGroup = useCallback((group_id: string, terms_accepted: boolean) => invoke("restart_group", { group_id, terms_accepted }), [invoke]);
  const searchUsers = useCallback((query: string) => invoke("search_users", { query }), [invoke]);
  const inviteGroupMember = useCallback((group_id: string, invitee_id: string) => invoke("invite_group_member", { group_id, invitee_id }), [invoke]);
  const respondGroupInvite = useCallback((invite_id: string, accept: boolean) => invoke("respond_group_invite", { invite_id, accept }), [invoke]);
  const respondGroupInviteByGroup = useCallback((group_id: string, accept: boolean) => invoke("respond_group_invite", { group_id, accept }), [invoke]);
  const createGroupInviteLink = useCallback((group_id: string) => invoke("create_group_invite_link", { group_id }), [invoke]);
  const validateGroupInviteLink = useCallback((token: string) => invoke("validate_group_invite_link", { token }), [invoke]);
  const joinGroupViaLink = useCallback((token: string) => invoke("join_group_via_link", { token }), [invoke]);
  const listGroupInvites = useCallback(() => invoke("list_group_invites"), [invoke]);
  const listPendingGroupInvitees = useCallback((group_id: string) => invoke("list_pending_group_invitees", { group_id }), [invoke]);
  const autoStartPendingGroups = useCallback((group_id?: string) => invoke("auto_start_pending_groups", group_id ? { group_id } : {}), [invoke]);
  const postGroupChat = useCallback((group_id: string, message: string) => invoke("post_group_chat", { group_id, message }), [invoke]);
  const listGroupChat = useCallback((group_id: string) => invoke("list_group_chat", { group_id }), [invoke]);
  const updateGroupSettings = useCallback((body: Record<string, unknown>) => invoke("update_group_settings", body), [invoke]);
  const acceptGroupMandate = useCallback(
    (group_id: string, payer?: { payer_bank_code: string; payer_account_number: string; payer_phone: string; payer_email: string; payer_address: string }) =>
      invoke("accept_group_mandate", { group_id, ...(payer || {}) }),
    [invoke]
  );
  const checkGroupMandateStatus = useCallback((group_id: string) => invoke("check_group_mandate_status", { group_id }), [invoke]);
  const sandboxAutoContribute = useCallback((force_group_id?: string) => invoke("sandbox_auto_contribute", force_group_id ? { force_group_id } : {}), [invoke]);

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
  const listPendingTargetInvites = useCallback(() => invoke("list_pending_target_invites"), [invoke]);
  const requestTargetWithdrawal = useCallback((target_id: string, amount: number, reason?: string) =>
    invoke("request_target_withdrawal", { target_id, amount, reason }), [invoke]);
  const voteTargetWithdrawal = useCallback((request_id: string, vote: string) =>
    invoke("vote_target_withdrawal", { request_id, vote }), [invoke]);
  const independentWithdrawal = useCallback((target_id: string) => invoke("independent_withdrawal", { target_id }), [invoke]);
  const updateTargetSettings = useCallback((body: Record<string, unknown>) => invoke("update_target_settings", body), [invoke]);
  const acceptTargetMandate = useCallback(
    (target_id: string, payer: { payer_bank_code: string; payer_account_number: string; payer_phone: string; payer_email: string; payer_address: string }) =>
      invoke("accept_target_mandate", { target_id, ...payer }),
    [invoke]
  );
  const checkTargetMandateStatus = useCallback((target_id: string) => invoke("check_target_mandate_status", { target_id }), [invoke]);
  const acceptGoalsaveMandate = useCallback(
    (savings_id: string, payer: { payer_bank_code: string; payer_account_number: string; payer_phone: string; payer_email: string; payer_address: string }) =>
      invoke("goalsave_v2_authorize_mandate", { savings_id, ...payer }),
    [invoke]
  );
  const checkGoalsaveMandateStatus = useCallback((savings_id: string) => invoke("goalsave_v2_check_mandate_status", { savings_id }), [invoke]);

  // Goal Funding (full parity)
  const createCampaign = useCallback((body: Record<string, unknown>) => invoke("create_campaign", body), [invoke]);
  const listCampaigns = useCallback(() => invoke("list_campaigns"), [invoke]);
  const contributeCampaign = useCallback((campaign_id: string, amount: number, anonymous?: boolean, message?: string, contributor_name?: string) =>
    invoke("contribute_campaign", { campaign_id, amount, anonymous, message, contributor_name }), [invoke]);
  const getCampaignDetail = useCallback((campaign_id: string) => invoke("get_campaign_detail", { campaign_id }), [invoke]);
  const postCampaignUpdate = useCallback((campaign_id: string, update_message: string) =>
    invoke("post_campaign_update", { campaign_id, update_message }), [invoke]);
  const withdrawCampaignEscrow = useCallback((campaign_id: string, amount?: number) =>
    invoke("withdraw_campaign_escrow", { campaign_id, amount }), [invoke]);

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
  const inviteSplitMember = useCallback((split_id: string, invitee_id: string) =>
    invoke("invite_split_member", { split_id, invitee_id }), [invoke]);

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
    requestSwap, respondSwap, exitGroup, deleteGroup, confirmContinue, restartGroup,
    searchUsers, inviteGroupMember, respondGroupInvite, respondGroupInviteByGroup, createGroupInviteLink, validateGroupInviteLink, joinGroupViaLink, listGroupInvites, listPendingGroupInvitees,
    autoStartPendingGroups,
    postGroupChat, listGroupChat, updateGroupSettings, acceptGroupMandate, checkGroupMandateStatus, sandboxAutoContribute,
    // Notifications
    listNotifications, markNotificationRead, markAllNotificationsRead,
    // Target Ajo
    createTarget, listTargets, contributeTarget, getTargetDetail,
    inviteTargetMember, respondTargetInvite, listPendingTargetInvites,
    requestTargetWithdrawal, voteTargetWithdrawal, independentWithdrawal, updateTargetSettings,
    acceptTargetMandate, checkTargetMandateStatus, acceptGoalsaveMandate, checkGoalsaveMandateStatus,
    // Goal Funding
    createCampaign, listCampaigns, contributeCampaign, getCampaignDetail, postCampaignUpdate, withdrawCampaignEscrow,
    // SplitPay
    createSplit, listSplits, joinSplit, paySplit,
    declineSplit, cancelSplit, removeSplitParticipant, getSplitDetail, inviteSplitMember,
    // Associations
    createAssociation, listAssociations, joinAssociation, getAssociationDetail, contributeAssociation,
    inviteAssocMember, respondAssocInvite, listAssocChat, postAssocChat,
    adminListPendingAssoc, adminReviewAssoc, adminAssocDocUrl,
    // Virtual Cards
    createVirtualCard, activateCard, cardPinChange, blockCard, unblockCard, getCards, getCardDetails,
  };
}
