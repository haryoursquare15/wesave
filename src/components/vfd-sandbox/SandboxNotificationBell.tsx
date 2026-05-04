import { useState, useEffect, useCallback } from "react";
import { Bell, Check, CheckCheck, X, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  body?: string | null;
  is_read: boolean | null;
  created_at: string;
  notification_type?: string;
  group_id?: string | null;
  invite_id?: string | null;
  inviter_name?: string | null;
  vfd_sandbox_groups?: PendingInvite["vfd_sandbox_groups"];
}

interface PendingInvite {
  id: string;
  group_id: string;
  inviter_id: string;
  inviter_name: string;
  created_at: string;
  vfd_sandbox_groups?: {
    id: string;
    name: string;
    contribution_amount: number;
    period: string;
  } | null;
}

export function SandboxNotificationBell() {
  const {
    listNotifications,
    listGroupInvites,
    markNotificationRead,
    markAllNotificationsRead,
    respondGroupInvite,
  } = useVfdSandboxProducts();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [notifRes, invitesRes] = await Promise.all([
      listNotifications(),
      listGroupInvites(),
    ]);
    setLoading(false);
    if (notifRes?.data) setItems(notifRes.data as Notification[]);
    if (invitesRes?.data) setInvites(invitesRes.data as PendingInvite[]);
  }, [listNotifications, listGroupInvites]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleRespond = async (inviteId: string, accept: boolean) => {
    setRespondingId(inviteId);
    try {
      const res = await respondGroupInvite(inviteId, accept);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success(accept ? "Joined group!" : "Invite declined");
        await refresh();
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to respond");
    } finally {
      setRespondingId(null);
    }
  };

  const pendingInviteByGroup = new Map(invites.map((invite) => [invite.group_id, invite]));

  const notificationInvites = items
    .filter((n) => n.notification_type === "group_invite")
    .map((n) => {
      const pending = n.group_id ? pendingInviteByGroup.get(n.group_id) : undefined;
      const inviteId = pending?.id || n.invite_id;
      if (!inviteId || !n.group_id) return null;
      return {
        id: inviteId,
        group_id: n.group_id,
        inviter_id: pending?.inviter_id || "",
        inviter_name: pending?.inviter_name || n.inviter_name || "Someone",
        created_at: pending?.created_at || n.created_at,
        vfd_sandbox_groups: pending?.vfd_sandbox_groups || n.vfd_sandbox_groups,
      } as PendingInvite;
    })
    .filter((invite): invite is PendingInvite => Boolean(invite));

  const actionableInvites = [
    ...invites,
    ...notificationInvites.filter((invite) => !invites.some((i) => i.id === invite.id)),
  ];

  // Hide stale group_invite notifications without a corresponding pending invite
  const inviteGroupIds = new Set(actionableInvites.map(i => i.group_id));
  const visibleNotifs = items.filter(n =>
    n.notification_type !== "group_invite" || (n.group_id && inviteGroupIds.has(n.group_id))
  );

  const unreadCount = items.filter(n => n.notification_type !== "group_invite" && !n.is_read).length + actionableInvites.length;
  const isEmpty = visibleNotifs.length === 0 && actionableInvites.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0 h-9 w-9">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <p className="text-sm font-semibold">Notifications</p>
          {items.some(n => !n.is_read) && (
            <Button size="sm" variant="ghost" onClick={handleMarkAll} className="h-7 text-xs">
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {loading && isEmpty ? (
            <div className="text-center text-xs text-muted-foreground py-6">Loading…</div>
          ) : isEmpty ? (
            <div className="text-center text-xs text-muted-foreground py-6">No notifications</div>
          ) : (
            <ul className="divide-y divide-border">
              {actionableInvites.map((inv) => {
                const g = inv.vfd_sandbox_groups;
                return (
                  <li key={`inv-${inv.id}`} className="p-3 bg-primary/5">
                    <div className="flex items-start gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">
                          {inv.inviter_name} invited you
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {g?.name || "Group"}
                          {g && ` • ₦${Number(g.contribution_amount).toLocaleString("en-NG")}/${g.period}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleRespond(inv.id, true)}
                        disabled={respondingId === inv.id}
                      >
                        {respondingId === inv.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <><Check className="h-3.5 w-3.5 mr-1" />Accept</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleRespond(inv.id, false)}
                        disabled={respondingId === inv.id}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />Decline
                      </Button>
                    </div>
                  </li>
                );
              })}
              {visibleNotifs.filter((n) => n.notification_type !== "group_invite").map((n) => (
                <li key={n.id} className={`p-3 ${!n.is_read ? "bg-primary/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{n.title}</p>
                      {(n.message || n.body) && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.message || n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.is_read && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => handleMarkRead(n.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
