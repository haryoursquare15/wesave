import { CheckCircle, XCircle, Clock, Trash2, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { SplitParticipant } from "@/hooks/useSplitPay";

interface Props {
  participants: SplitParticipant[];
  totalSlots: number;
  isCreator: boolean;
  currentUserId: string | undefined;
  nudgingId: string | null;
  removingId: string | null;
  onNudge: (participant: SplitParticipant) => void;
  onRemove: (participant: SplitParticipant) => void;
}

const statusIcon: Record<string, React.ReactNode> = {
  paid: <CheckCircle className="h-4 w-4 text-secondary" />,
  declined: <XCircle className="h-4 w-4 text-destructive" />,
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  accepted: <Clock className="h-4 w-4 text-primary" />,
};

export function SplitParticipantList({
  participants,
  totalSlots,
  isCreator,
  currentUserId,
  nudgingId,
  removingId,
  onNudge,
  onRemove,
}: Props) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-semibold text-foreground mb-4">
        Participants ({participants.length}/{totalSlots})
      </h3>
      <div className="space-y-3">
        {participants.map((p) => (
          <div key={p.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                {p.profile?.avatar_url && <AvatarImage src={p.profile.avatar_url} />}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {(p.profile?.full_name || p.profile?.username || "?")[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {p.profile?.full_name || p.profile?.username || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">₦{Number(p.amount_due).toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                {statusIcon[p.status] || statusIcon.pending}
                <span className="text-xs capitalize text-muted-foreground">{p.status}</span>
              </div>
              {isCreator && p.status === "pending" && p.user_id !== currentUserId && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    title="Remind to pay"
                    disabled={nudgingId === p.user_id}
                    onClick={() => onNudge(p)}
                  >
                    <BellRing className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={removingId === p.user_id}
                    onClick={() => onRemove(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
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
  );
}
