import { useState, useEffect } from "react";
import { Bell, Check, X, Users, Loader2, Trash2, AlertTriangle, CheckCircle, Info, CreditCard, Receipt } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePendingInvites, useRespondToInvite } from "@/hooks/useGroupInvites";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

function getNotificationIcon(type: string) {
  switch (type) {
    case "contribution_success":
    case "card_fallback_success":
      return <CheckCircle className="h-5 w-5 text-secondary" />;
    case "contribution_failed":
    case "card_fallback_failed":
    case "contribution_defaulted":
      return <AlertTriangle className="h-5 w-5 text-destructive" />;
    case "contribution_retry":
      return <CreditCard className="h-5 w-5 text-accent-foreground" />;
    case "split_invite":
    case "split_decline":
      return <Receipt className="h-5 w-5 text-primary" />;
    default:
      return <Info className="h-5 w-5 text-primary" />;
  }
}

function extractSplitRequestId(message: string): string | null {
  const match = message.match(/\/split-pay\/([a-f0-9-]+)/);
  return match ? match[1] : null;
}

function cleanMessage(message: string): string {
  return message.replace(/\nTap to view and respond → \/split-pay\/[a-f0-9-]+/, "");
}

export function PendingInvitesNotification() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { invites, loading: invitesLoading, refetch } = usePendingInvites();
  const { respond, loading: responding } = useRespondToInvite();
  const { notifications, loading: notificationsLoading, unreadCount, clearAll, markAllRead, refetch: refetchNotifs } = useNotifications();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [decliningNotifId, setDecliningNotifId] = useState<string | null>(null);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const [acceptPhase, setAcceptPhase] = useState<string | null>(null);

  const handleRespond = async (inviteId: string, accept: boolean) => {
    setRespondingId(inviteId);
    try {
      if (accept) {
        setAcceptPhase("Checking wallet...");
        await new Promise(r => setTimeout(r, 400));
        setAcceptPhase("Sweeping contribution...");
      }
      const result = await respond(inviteId, accept);
      if (accept) {
        setAcceptPhase("Paid! Joining group...");
        await new Promise(r => setTimeout(r, 600));
      }
      toast.success(result.message || (accept ? "You joined the group!" : "Invite declined"));
      refetch();
      
      if (accept && result.group_id) {
        navigate(`/groups/${result.group_id}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to respond");
    } finally {
      setRespondingId(null);
      setAcceptPhase(null);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-NG").format(amount);
  };

  const totalBadgeCount = invites.length + unreadCount;

  const handleClearAll = async () => {
    await clearAll();
    toast.success("All notifications cleared");
  };

  const handlePopoverOpen = () => {
    // Mark all as read when panel opens
    if (unreadCount > 0) {
      markAllRead();
    }
  };

  return (
    <Popover onOpenChange={(open) => open && handlePopoverOpen()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalBadgeCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
            >
              {totalBadgeCount > 99 ? "99+" : totalBadgeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Tabs defaultValue="all" className="w-full">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs px-2 h-7">
                All {notifications.length > 0 && `(${notifications.length})`}
              </TabsTrigger>
              <TabsTrigger value="invites" className="text-xs px-2 h-7">
                Invites {invites.length > 0 && `(${invites.length})`}
              </TabsTrigger>
            </TabsList>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={handleClearAll}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <TabsContent value="all" className="mt-0 overflow-hidden">
            <ScrollArea className="h-80">
              {notificationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                    {notifications.map((notif) => {
                      const splitRequestId = extractSplitRequestId(notif.message);
                      const displayMessage = cleanMessage(notif.message);
                      const isSplitInvite = notif.notification_type === "split_invite" && !!splitRequestId;
                      const deepLink = splitRequestId ? `/split-pay/${splitRequestId}` : null;

                      const handleDeclineSplit = async (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (!user || !splitRequestId) return;
                        setDecliningNotifId(notif.id);
                        const { data, error } = await supabase.rpc("decline_split_participation", {
                          _split_request_id: splitRequestId,
                          _user_id: user.id,
                        });
                        setDecliningNotifId(null);
                        if (error) {
                          toast.error(error.message);
                        } else {
                          toast.success("Split request declined");
                          refetchNotifs();
                        }
                      };

                      const handleAcceptSplit = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (deepLink) navigate(deepLink);
                      };

                      return (
                        <div
                          key={notif.id}
                          className={`p-3 transition-colors ${!notif.is_read ? "bg-primary/5" : ""} ${deepLink ? "cursor-pointer hover:bg-muted/50" : "hover:bg-muted/50"}`}
                          onClick={() => deepLink && navigate(deepLink)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                              {getNotificationIcon(notif.notification_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{notif.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{displayMessage}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                              </p>
                            </div>
                            {!notif.is_read && (
                              <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                            )}
                          </div>
                          {isSplitInvite && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                className="flex-1 h-8"
                                onClick={handleAcceptSplit}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                View & Pay
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-8"
                                onClick={handleDeclineSplit}
                                disabled={decliningNotifId === notif.id}
                              >
                                {decliningNotifId === notif.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <X className="h-4 w-4 mr-1" />
                                    Decline
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="invites" className="mt-0 overflow-hidden">
            <ScrollArea className="h-80">
              {invitesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : invites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
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
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-xs truncate">{acceptPhase || "Processing..."}</span>
                            </span>
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Accept & Pay
                            </>
                          )}
                        </Button>
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
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
