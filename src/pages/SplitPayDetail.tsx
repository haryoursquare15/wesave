import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, CheckCircle, XCircle, Ban, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useSplitRequestDetail, type SplitParticipant } from "@/hooks/useSplitPay";
import { useToast } from "@/hooks/use-toast";
import { SplitInviteDialog } from "@/components/splitpay/SplitInviteDialog";
import { SplitSummaryCard } from "@/components/splitpay/SplitSummaryCard";
import { SplitParticipantList } from "@/components/splitpay/SplitParticipantList";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

import { getUserFriendlyError } from "@/lib/errorMessages";
export default function SplitPayDetail() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { request, participants, creatorProfile, loading, isGroupComplete, payShare, declineShare, cancelRequest, removeParticipant } = useSplitRequestDetail(requestId);
  const [paying, setPaying] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [covering, setCovering] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const fetchWalletBalance = useCallback(async () => {
    if (!user) {
      setWalletBalance(null);
      return;
    }
    const { data } = await supabase
      .from("wallets")
      .select("available_balance")
      .eq("user_id", user.id)
      .maybeSingle();
    setWalletBalance(Number(data?.available_balance ?? 0));
  }, [user]);

  useEffect(() => {
    fetchWalletBalance();
  }, [fetchWalletBalance]);

  if (loading || !request) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isCreator = user?.id === request.creator_user_id;
  const myParticipation = participants.find((p) => p.user_id === user?.id);
  const creatorName = creatorProfile?.full_name || creatorProfile?.username || "Unknown";
  const activeParticipantsCount = participants.filter((p) => p.status !== "declined").length;
  const paidCount = participants.filter((p) => p.status === "paid").length;
  const slotsRemaining = Math.max(request.number_of_people - activeParticipantsCount, 0);

  const feePerPerson = request.number_of_people > 0
    ? Math.ceil((Number(request.platform_fee) / request.number_of_people) * 100) / 100
    : 0;

  const myAmountDue = myParticipation ? Number(myParticipation.amount_due) : Number(request.amount_per_person);
  const totalDue = myAmountDue + feePerPerson;
  const hasEnoughBalance = walletBalance === null || walletBalance >= totalDue;

  // Payment is allowed as long as user is a pending participant - no group completion check
  const payBlockedReason = !hasEnoughBalance ? "Insufficient balance" : null;

  const handlePay = async () => {
    if (payBlockedReason) {
      toast({
        title: "Payment blocked",
        description: `You need ₦${totalDue.toLocaleString()} (₦${myAmountDue.toLocaleString()} share + ₦${feePerPerson.toLocaleString()} fee) but your balance is ₦${(walletBalance ?? 0).toLocaleString()}. Please fund your wallet first.`,
        variant: "destructive",
      });
      return;
    }

    setPaying(true);
    try {
      const result = await payShare();
      setPaying(false);
      await fetchWalletBalance();

      if (result.success) {
        const allPaid = 'all_paid' in result ? result.all_paid : false;
        const paidCountResult = 'paid_count' in result ? result.paid_count : paidCount + 1;
        const requiredCount = 'required_count' in result ? result.required_count : request.number_of_people;
        toast({
          title: "Payment Successful!",
          description: allPaid
            ? "All participants have paid! Merchant settlement is processing."
            : `Your share has been paid. ${paidCountResult}/${requiredCount} paid so far.`,
        });
      } else {
        console.error("[SplitPay] Payment failed result:", result);
        toast({ title: "Payment Failed", description: getUserFriendlyError(result.error || "Something went wrong"), variant: "destructive" });
      }
    } catch (err: any) {
      setPaying(false);
      console.error("[SplitPay] Payment exception:", err);
      toast({ title: "Payment Failed", description: getUserFriendlyError(err?.message || "An unexpected error occurred"), variant: "destructive" });
    }
  };

  const handleCoverOutstanding = async () => {
    setCovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("vfd-sandbox-products", {
        body: { action: "cover_split_shares", split_id: requestId },
      });
      const err = error?.message || (data as any)?.error;
      if (err) {
        toast({ title: "Could not complete payment", description: getUserFriendlyError(err), variant: "destructive" });
      } else {
        toast({
          title: "Outstanding shares paid",
          description: "The split is fully funded — the bill is being delivered now.",
        });
        await fetchWalletBalance();
      }
    } catch (e: any) {
      toast({ title: "Could not complete payment", description: getUserFriendlyError(e?.message || "Unexpected error"), variant: "destructive" });
    } finally {
      setCovering(false);
    }
  };


  const handleDecline = async () => {
    const result = await declineShare();
    if (result?.success === false) {
      toast({ title: "Error", description: getUserFriendlyError(result.error || "Could not decline"), variant: "destructive" });
    } else {
      toast({ title: "Declined", description: "You have declined this split request." });
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    const result = await cancelRequest();
    setCancelling(false);
    if (result?.success) {
      const refundMsg = result.refunded_count > 0
        ? ` ${result.refunded_count} participant(s) have been refunded.`
        : "";
      toast({ title: "Cancelled", description: `Split request has been cancelled.${refundMsg}` });
    } else {
      toast({ title: "Error", description: getUserFriendlyError(result?.error || "Could not cancel"), variant: "destructive" });
    }
  };

  const handleNudge = async (participant: SplitParticipant) => {
    setNudgingId(participant.user_id);
    const { data, error } = await supabase.rpc("send_split_payment_reminder" as any, {
      _split_request_id: request.id,
      _target_user_id: participant.user_id,
    } as any);
    setNudgingId(null);

    const result = data as { success?: boolean; error?: string } | null;
    if (error || result?.success === false) {
      toast({
        title: "Error",
        description: getUserFriendlyError(error?.message || result?.error || "Reminder could not be sent"),
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Reminder sent!", description: `${participant.profile?.full_name || "Participant"} has been notified.` });
  };

  const handleRemove = async (participant: SplitParticipant) => {
    setRemovingId(participant.user_id);
    const result = await removeParticipant(participant.user_id);
    setRemovingId(null);
    if (result.success) {
      toast({ title: "Removed", description: `${participant.profile?.full_name || "Participant"} has been removed.` });
    } else {
      toast({ title: "Error", description: getUserFriendlyError(result.error || "Could not remove"), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/split-pay")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-lg font-bold text-foreground">Split Details</h1>
            </div>
            {isCreator && request.status === "active" && slotsRemaining > 0 && (
              <Button variant="outline" size="default" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-5 w-5 mr-1" /> Invite
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-lg">
        <SplitSummaryCard request={request} participants={participants} creatorName={creatorName} />

        {/* Wallet balance check for pending participants */}
        {request.status === "active" && myParticipation?.status === "pending" && walletBalance !== null && (
          <div className={`rounded-xl p-4 border ${hasEnoughBalance ? "bg-secondary/10 border-secondary/20" : "bg-destructive/10 border-destructive/20"}`}>
            <p className="text-sm font-semibold text-foreground">
              {hasEnoughBalance ? "✅ Ready to pay" : "⚠️ Insufficient balance"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Wallet: ₦{walletBalance.toLocaleString()} · Required: ₦{totalDue.toLocaleString()} (₦{myAmountDue.toLocaleString()} + ₦{feePerPerson.toLocaleString()} fee)
            </p>
            {!hasEnoughBalance && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate("/wallet")}>
                Fund Wallet
              </Button>
            )}
          </div>
        )}

        {/* Group progress info (informational only, does NOT block payment) */}
        {request.status === "active" && slotsRemaining > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground text-sm">
                {activeParticipantsCount} of {request.number_of_people} participants joined
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {paidCount} paid so far. Settlement to merchant happens when all {request.number_of_people} have paid.
                {isCreator && ` Invite ${slotsRemaining} more to fill all slots.`}
              </p>
            </div>
          </div>
        )}

        {/* Accept & Pay / Decline buttons */}
        {myParticipation && request.status === "active" && myParticipation.status === "pending" && (
          <div className="flex gap-3">
            <Button className="flex-1 min-h-[48px] text-base" onClick={handlePay} disabled={paying || Boolean(payBlockedReason)}>
              {paying ? "Processing..." : payBlockedReason || `Accept & Pay ₦${totalDue.toLocaleString()}`}
            </Button>
            <Button variant="outline" className="flex-1 min-h-[48px] text-base" onClick={handleDecline}>
              Decline
            </Button>
          </div>
        )}

        {/* Paid confirmation */}
        {myParticipation?.status === "paid" && (
          <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4 text-center">
            <CheckCircle className="h-6 w-6 text-secondary mx-auto mb-1" />
            <p className="font-semibold text-foreground">You've paid your share</p>
            <p className="text-sm text-muted-foreground">
              ₦{Number(myParticipation.amount_due).toLocaleString()} on{" "}
              {myParticipation.paid_at ? format(new Date(myParticipation.paid_at), "MMM d, HH:mm") : ""}
            </p>
            {!isGroupComplete && request.status === "active" && (
              <p className="text-xs text-muted-foreground mt-2">
                Waiting for {request.number_of_people - paidCount} more payment{request.number_of_people - paidCount > 1 ? "s" : ""} before merchant settlement.
              </p>
            )}
          </div>
        )}

        {/* Creator: cover the outstanding shares so the bill can be delivered */}
        {isCreator && request.status === "active" && outstandingTotal > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
            <div>
              <p className="font-semibold text-foreground">Outstanding shares</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ₦{outstandingTotal.toLocaleString()} is still unpaid across {pendingParticipants.length} participant
                {pendingParticipants.length > 1 ? "s" : ""}. You can pay it yourself to complete the bill — payment goes
                through the normal bill delivery flow.
              </p>
            </div>
            <Button
              className="w-full min-h-[48px] text-base"
              onClick={handleCoverOutstanding}
              disabled={covering}
            >
              {covering ? "Processing..." : `Pay outstanding ₦${outstandingTotal.toLocaleString()}`}
            </Button>
          </div>
        )}



        {/* Declined confirmation */}
        {myParticipation?.status === "declined" && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center">
            <XCircle className="h-6 w-6 text-destructive mx-auto mb-1" />
            <p className="font-semibold text-foreground">You declined this split</p>
          </div>
        )}

        {/* Creator: invite prompt when slots available */}
        {isCreator && request.status === "active" && slotsRemaining > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">
                {slotsRemaining} slot{slotsRemaining === 1 ? "" : "s"} remaining
              </p>
              <p className="text-sm text-muted-foreground">
                Invite {slotsRemaining} more {slotsRemaining === 1 ? "person" : "people"} to complete this split.
              </p>
            </div>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        )}

        {/* Participant list */}
        <SplitParticipantList
          participants={participants}
          totalSlots={request.number_of_people}
          isCreator={isCreator}
          allowManagementActions={request.status === "active"}
          currentUserId={user?.id}
          nudgingId={nudgingId}
          removingId={removingId}
          onNudge={handleNudge}
          onRemove={handleRemove}
        />

        {/* Cancel button for creator */}
        {isCreator && request.status === "active" && (
          <div className="space-y-2">
            {paidCount > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                ⚠️ Cancelling will refund {paidCount} participant{paidCount > 1 ? "s" : ""} who already paid.
              </p>
            )}
            <Button
              variant="destructive"
              className="w-full min-h-[48px] text-base"
              onClick={handleCancel}
              disabled={cancelling}
            >
              <Ban className="h-5 w-5 mr-1" />
              {cancelling ? "Cancelling..." : "Cancel Split Request"}
            </Button>
          </div>
        )}
      </main>

      {isCreator && (
        <SplitInviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          splitRequestId={request.id}
          amountPerPerson={Number(request.amount_per_person)}
          purpose={request.purpose}
          existingParticipantIds={participants.map((p) => p.user_id)}
          maxParticipants={request.number_of_people}
        />
      )}

      <BottomNav />
    </div>
  );
}
