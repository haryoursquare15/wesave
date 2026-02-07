import { useState, useCallback } from "react";
import { ArrowLeftRight, Check, X, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePositionSwap } from "@/hooks/usePositionSwap";

interface PayoutMember {
  payout_position: number;
  member_user_id: string;
  member_full_name: string;
  member_username: string;
  member_avatar_url: string;
  member_has_received_payout: boolean;
}

interface SwapPositionDialogProps {
  groupId: string;
  currentUserId: string;
  payoutOrder: PayoutMember[];
  children: React.ReactNode;
}

export function SwapPositionDialog({
  groupId,
  currentUserId,
  payoutOrder,
  children,
}: SwapPositionDialogProps) {
  const [open, setOpen] = useState(false);
  const { hasUsedSwap, requesting, requestSwap } = usePositionSwap(groupId);

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const eligibleMembers = payoutOrder.filter(
    (m) => m.member_user_id !== currentUserId && !m.member_has_received_payout
  );

  const handleSwapRequest = async (targetUserId: string) => {
    const result = await requestSwap(targetUserId);
    if (result.success) {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Swap Payout Position
          </DialogTitle>
          <DialogDescription>
            Request to swap your payout position with another member. 
            You can only swap once per group.
          </DialogDescription>
        </DialogHeader>

        {hasUsedSwap ? (
          <div className="p-4 rounded-xl bg-muted text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="font-medium">Swap Already Used</p>
            <p className="text-sm text-muted-foreground mt-1">
              You have already used your one-time swap privilege in this group.
            </p>
          </div>
        ) : eligibleMembers.length === 0 ? (
          <div className="p-4 rounded-xl bg-muted text-center">
            <p className="text-muted-foreground">
              No eligible members to swap with.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {eligibleMembers.map((member) => (
                <div
                  key={member.member_user_id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {member.payout_position}
                  </div>
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.member_avatar_url || undefined} />
                    <AvatarFallback>
                      {getInitials(member.member_full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {member.member_full_name || member.member_username || "Unknown"}
                    </p>
                    {member.member_username && (
                      <p className="text-xs text-muted-foreground">
                        @{member.member_username}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSwapRequest(member.member_user_id)}
                    disabled={requesting}
                  >
                    {requesting ? (
                      <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                      "Request"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SwapResponseButtonProps {
  requestId: string;
  accept: boolean;
  onRespond: (requestId: string, accept: boolean) => Promise<{ success: boolean; error?: string }>;
}

function SwapResponseButton({ requestId, accept, onRespond }: SwapResponseButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      await onRespond(requestId, accept);
    } finally {
      setLoading(false);
    }
  }, [requestId, accept, onRespond]);

  if (accept) {
    return (
      <Button
        size="sm"
        variant="hero"
        onClick={handleClick}
        disabled={loading}
        className="flex-1"
      >
        {loading ? (
          <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
        ) : (
          <>
            <Check className="h-4 w-4 mr-1" />
            Accept
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={loading}
      className="flex-1"
    >
      {loading ? (
        <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      ) : (
        <>
          <X className="h-4 w-4 mr-1" />
          Decline
        </>
      )}
    </Button>
  );
}

interface SwapRequestNotificationProps {
  groupId: string;
}

export function SwapRequestNotification({ groupId }: SwapRequestNotificationProps) {
  const { pendingRequests, respondToSwap } = usePositionSwap(groupId);

  if (pendingRequests.length === 0) return null;

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-2">
      {pendingRequests.map((request) => (
        <div
          key={request.id}
          className="p-4 rounded-xl bg-primary/10 border border-primary/30"
        >
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={request.requester_profile?.avatar_url || undefined} />
              <AvatarFallback>
                {getInitials(request.requester_profile?.full_name || null)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium text-foreground">
                {request.requester_profile?.full_name || "A member"} wants to swap positions
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Their position #{request.requester_position} ↔ Your position #{request.target_position}
              </p>
              <div className="flex gap-2 mt-3">
                <SwapResponseButton
                  requestId={request.id}
                  accept={true}
                  onRespond={respondToSwap}
                />
                <SwapResponseButton
                  requestId={request.id}
                  accept={false}
                  onRespond={respondToSwap}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
