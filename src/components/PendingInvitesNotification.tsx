import { useState, useEffect } from "react";
import { Bell, Check, X, Users, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePendingInvites, useRespondToInvite } from "@/hooks/useGroupInvites";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

export function PendingInvitesNotification() {
  const navigate = useNavigate();
  const { invites, loading, refetch } = usePendingInvites();
  const { respond, loading: responding } = useRespondToInvite();
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleRespond = async (inviteId: string, accept: boolean) => {
    setRespondingId(inviteId);
    try {
      const result = await respond(inviteId, accept);
      toast.success(result.message || (accept ? "You joined the group!" : "Invite declined"));
      refetch();
      
      if (accept && result.group_id) {
        navigate(`/groups/${result.group_id}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to respond");
    } finally {
      setRespondingId(null);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-NG").format(amount);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {invites.length > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
            >
              {invites.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border">
          <h3 className="font-semibold text-sm">Notifications</h3>
        </div>
        <ScrollArea className="max-h-80">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No pending invites</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {invites.map((invite) => (
                <div key={invite.id} className="p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {invite.inviter_name} invited you
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {invite.group_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ₦{formatAmount(invite.contribution_amount)}/{invite.period}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => handleRespond(invite.id, true)}
                      disabled={responding && respondingId === invite.id}
                    >
                      {responding && respondingId === invite.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Accept
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8"
                      onClick={() => handleRespond(invite.id, false)}
                      disabled={responding && respondingId === invite.id}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}