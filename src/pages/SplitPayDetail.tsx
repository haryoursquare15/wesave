import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, CheckCircle, XCircle, Ban, AlertTriangle } from "lucide-react";
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

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const fetchWalletBalance = useCallback(async () => {
    if (!user) {
      setWalletBalance(null);
      return;
    }

    const { data, error } = await supabase
      .from("wallets")
      .select("available_balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return;
    }

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
  const slotsRemaining = Math.max(request.number_of_people - activeParticipantsCount, 0);

  const feePerPerson = useMemo(
    () => (request.number_of_people > 0 ? Math.ceil((Number(request.platform_fee) / request.number_of_people) * 100) / 100 : 0),
    [request.platform_fee, request.number_of_people]
  );

  const myAmountDue = myParticipation ? Number(myParticipation.amount_due) : Number(request.amount_per_person);
  const totalDue = myAmountDue + feePerPerson;
  const hasEnoughBalance = walletBalance === null || walletBalance >= totalDue;
  const payBlockedReason = !isGroupComplete
    ? "Waiting for group..."
    : !hasEnoughBalance
      ? "Insufficient balance"
      : null;

  const handlePay = async () => {
    if (payBlockedReason) {
      toast({
        title: "Payment blocked",
        description: payBlockedReason === "Insufficient balance"
          ? `You need ₦${totalDue.toLocaleString()} (including fee) to pay this split.`
          : "Payments are enabled once all participant slots are filled.",
        variant: "destructive",
      });
      return;
    }

    setPaying(true);
    const result = await payShare();
    setPaying(false);
    await fetchWalletBalance();

    if (result.success) {
      toast({ title: "Payment Successful!", description: "Your share has been paid." });
    } else {
      toast({ title: "Payment Failed", description: result.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleDecline = async () => {
    const result = await declineShare();
    if (result?.success === false) {
      toast({ title: "Error", description: result.error || "Could not decline", variant: "destructive" });
    } else {
      toast({ title: "Declined", description: "You have declined this split request." });
    }
  };

  const handleCancel = async () => {
    await cancelRequest();
    toast({ title: "Cancelled", description: "Split request has been cancelled." });
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
        description: error?.message || result?.error || "Reminder could not be sent",
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
      toast({ title: "Error", description: result.error || "Could not remove", variant: "destructive" });
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
            {isCreator && request.status === "active" && (
              <Button variant="outline" size="default" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-5 w-5 mr-1" /> Invite
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-lg">
        <SplitSummaryCard request={request} participants={participants} creatorName={creatorName} />

        {request.status === "active" && myParticipation?.status === "pending" && walletBalance !== null && (
          <div className={`rounded-xl p-4 border ${hasEnoughBalance ? "bg-secondary/10 border-secondary/20" : "bg-destructive/10 border-destructive/20"}`}>
            <p className="text-sm font-semibold text-foreground">Your payment check</p>
            <p className="text-xs text-muted-foreground mt-1">
              Wallet balance: ₦{walletBalance.toLocaleString()} · Required now: ₦{totalDue.toLocaleString()} (₦{myAmountDue.toLocaleString()} share + ₦{feePerPerson.toLocaleString()} fee)
            </p>
          </div>
        )}

        {request.status === "active" && !isGroupComplete && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground text-sm">Group Incomplete</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeParticipantsCount} of {request.number_of_people} participants. Payments are blocked until the group is full.
                {isCreator && " Invite more people to proceed."}
              </p>
            </div>
          </div>
        )}

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

        {myParticipation?.status === "paid" && (
          <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4 text-center">
            <CheckCircle className="h-6 w-6 text-secondary mx-auto mb-1" />
            <p className="font-semibold text-foreground">You've paid your share</p>
            <p className="text-sm text-muted-foreground">
              ₦{Number(myParticipation.amount_due).toLocaleString()} on{" "}
              {myParticipation.paid_at ? format(new Date(myParticipation.paid_at), "MMM d, HH:mm") : ""}
            </p>
          </div>
        )}

        {myParticipation?.status === "declined" && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center">
            <XCircle className="h-6 w-6 text-destructive mx-auto mb-1" />
            <p className="font-semibold text-foreground">You declined this split</p>
          </div>
        )}

        {isCreator && request.status === "active" && activeParticipantsCount < request.number_of_people && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">
                {activeParticipantsCount} of {request.number_of_people} participants added
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

        {isCreator && request.status === "active" && (
          <Button variant="destructive" className="w-full min-h-[48px] text-base" onClick={handleCancel}>
            <Ban className="h-5 w-5 mr-1" /> Cancel Split Request
          </Button>
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

