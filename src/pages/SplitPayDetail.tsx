import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, Receipt, CheckCircle, XCircle, Clock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useSplitRequestDetail } from "@/hooks/useSplitPay";
import { useToast } from "@/hooks/use-toast";
import { SplitInviteDialog } from "@/components/splitpay/SplitInviteDialog";
import { format } from "date-fns";

export default function SplitPayDetail() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { request, participants, creatorProfile, loading, payShare, declineShare, cancelRequest } = useSplitRequestDetail(requestId);
  const [paying, setPaying] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  if (loading || !request) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isCreator = user?.id === request.creator_user_id;
  const myParticipation = participants.find((p) => p.user_id === user?.id);
  const paidCount = participants.filter((p) => p.status === "paid").length;
  const progressPct = participants.length > 0 ? (paidCount / participants.length) * 100 : 0;

  const handlePay = async () => {
    setPaying(true);
    const result = await payShare();
    setPaying(false);
    if (result.success) {
      toast({ title: "Payment Successful!", description: "Your share has been paid." });
    } else {
      toast({ title: "Payment Failed", description: result.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleDecline = async () => {
    await declineShare();
    toast({ title: "Declined", description: "You have declined this split request." });
  };

  const handleCancel = async () => {
    await cancelRequest();
    toast({ title: "Cancelled", description: "Split request has been cancelled." });
  };

  const statusIcon = {
    paid: <CheckCircle className="h-4 w-4 text-secondary" />,
    declined: <XCircle className="h-4 w-4 text-destructive" />,
    pending: <Clock className="h-4 w-4 text-muted-foreground" />,
    accepted: <Clock className="h-4 w-4 text-primary" />,
  };

  return (
    <div className="min-h-screen bg-background pb-20">
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
              <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1" /> Invite
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-lg">
        {/* Summary Card */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Receipt className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground">{request.purpose}</h2>
              <p className="text-sm text-muted-foreground">
                Created by {creatorProfile?.full_name || creatorProfile?.username || "Unknown"}
              </p>
            </div>
            <Badge variant={request.status === "active" ? "default" : request.status === "completed" ? "secondary" : "destructive"}>
              {request.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Bill</p>
              <p className="text-lg font-bold text-foreground">₦{Number(request.total_amount).toLocaleString()}</p>
            </div>
            <div className="bg-primary/5 rounded-lg p-3 text-center border border-primary/20">
              <p className="text-xs text-muted-foreground">Your Share</p>
              <p className="text-lg font-bold text-primary">₦{Number(request.amount_per_person).toLocaleString()}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment Progress</span>
              <span className="font-semibold text-foreground">{paidCount} of {participants.length} paid</span>
            </div>
            <Progress value={progressPct} className="h-3" />
          </div>

          {/* Merchant Info */}
          <div className="bg-muted/20 rounded-lg p-3 space-y-1 text-sm">
            <p className="font-semibold text-foreground">Merchant Details</p>
            <p className="text-muted-foreground">{request.merchant_account_name}</p>
            <p className="text-muted-foreground">{request.merchant_bank_name} — {request.merchant_account_number}</p>
          </div>

          {request.expiry_date && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Expires: {format(new Date(request.expiry_date), "MMM d, yyyy HH:mm")}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {myParticipation && request.status === "active" && myParticipation.status === "pending" && (
          <div className="flex gap-3">
            <Button className="flex-1" onClick={handlePay} disabled={paying}>
              {paying ? "Processing..." : "Accept & Pay"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleDecline}>
              Decline
            </Button>
          </div>
        )}
        {myParticipation?.status === "paid" && (
          <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4 text-center">
            <CheckCircle className="h-6 w-6 text-secondary mx-auto mb-1" />
            <p className="font-semibold text-foreground">You've paid your share</p>
            <p className="text-sm text-muted-foreground">₦{Number(myParticipation.amount_due).toLocaleString()} on {myParticipation.paid_at ? format(new Date(myParticipation.paid_at), "MMM d, HH:mm") : ""}</p>
          </div>
        )}
        {myParticipation?.status === "declined" && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center">
            <XCircle className="h-6 w-6 text-destructive mx-auto mb-1" />
            <p className="font-semibold text-foreground">You declined this split</p>
          </div>
        )}

        {/* Add More Participants Prompt */}
        {isCreator && request.status === "active" && participants.length < request.number_of_people && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">
                {participants.length} of {request.number_of_people} participants added
              </p>
              <p className="text-sm text-muted-foreground">
                Invite {request.number_of_people - participants.length} more {request.number_of_people - participants.length === 1 ? "person" : "people"} to complete this split.
              </p>
            </div>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        )}

        {/* Participants */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold text-foreground mb-4">Participants ({participants.length}/{request.number_of_people})</h3>
          <div className="space-y-3">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {(p.profile?.full_name || p.profile?.username || "?")[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {p.profile?.full_name || p.profile?.username || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">₦{Number(p.amount_due).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {statusIcon[p.status as keyof typeof statusIcon]}
                  <span className="text-xs capitalize text-muted-foreground">{p.status}</span>
                </div>
              </div>
            ))}
            {participants.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No participants yet. Invite people to split this bill.
              </p>
            )}
          </div>
        </div>

        {/* Creator Actions */}
        {isCreator && request.status === "active" && (
          <Button variant="destructive" className="w-full" onClick={handleCancel}>
            <Ban className="h-4 w-4 mr-1" /> Cancel Split Request
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
        />
      )}

      <BottomNav />
    </div>
  );
}
