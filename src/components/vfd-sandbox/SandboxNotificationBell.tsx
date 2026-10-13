import { useState, useEffect, useCallback } from "react";
import { Bell, Check, X, Users, Loader2, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { formatDistanceToNow, isToday } from "date-fns";
import { toast } from "sonner";

import { getUserFriendlyError } from "@/lib/errorMessages";
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
  invite_status?: string | null;
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

/**
 * Rewrite system notification copy into plain, friendly wording and strip raw
 * references from the list view (references belong in the detail view only).
 */
function friendlyNotification(n: Notification): { title: string; body: string } {
  let title = n.title || "Notification";
  let body = n.message || n.body || "";

  if (/penalty served/i.test(title)) {
    title = "Contribution missed";
    body = body
      .replace(/\$(\d[\d,]*(?:\.\d+)?)/g, "₦$1")
      .replace(/penalty/gi, "fee");
    if (!/fund your wallet/i.test(body)) {
      body = `${body} Fund your wallet to avoid more fees.`.trim();
    }
  } else if (/auto-contribution failed/i.test(title)) {
    title = "Contribution retrying in 30 minutes";
    body = "Please fund your wallet.";
  }

  // Strip long raw references/ids from the list copy.
  body = body.replace(/\b[A-Z0-9_-]{14,}\b/g, "").replace(/\s{2,}/g, " ").trim();
  return { title, body };
}

export function SandboxNotificationBell() {
  const {
    listNotifications,
    listGroupInvites,
    markAllNotificationsRead,
    respondGroupInvite,
    respondGroupInviteByGroup,
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

  // Invites already seen in the tray stop counting toward the badge.
  const [seenInvites, setSeenInvites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("vst_seen_invites") || "[]")); } catch { return new Set(); }
  });

  const markAllRead = useCallback(async () => {
    // Optimistic: clear locally first, then persist on the server.
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setInvites((cur) => {
      setSeenInvites((prev) => {
        const next = new Set(prev);
        cur.forEach((i) => next.add(i.id));
        try { localStorage.setItem("vst_seen_invites", JSON.stringify([...next].slice(-200))); } catch { /* ignore */ }
        return next;
      });
      return cur;
    });
    const res = await markAllNotificationsRead();
    if (res?.error) toast.error("Couldn't sync read status. We'll retry next time.");
  }, [markAllNotificationsRead]);

  // Opening the sheet marks everything read on the server, then reloads.
  useEffect(() => {
    if (!open) return;
    (async () => {
      await markAllRead();
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRespond = async (inviteId: string, accept: boolean, groupId?: string, notificationId?: string) => {
    setRespondingId(inviteId);
    try {
      const res = inviteId.startsWith("group:") && groupId
        ? await respondGroupInviteByGroup(groupId, accept)
        : await respondGroupInvite(inviteId, accept);
      if (res?.error) {
        // Stale notification (group/invite deleted) — clear it from the bell
        if (/not found/i.test(res.error)) {
          setItems(prev => prev.filter(n => n.id !== notificationId));
          toast.message("This invite is no longer available");
          await refresh();
        } else {
          toast.error(getUserFriendlyError(res.error));
        }
      } else {
        toast.success(accept ? "Joined group!" : "Invite declined");
        await refresh();
      }
    } catch (e: any) {
      toast.error(getUserFriendlyError(e?.message || "Failed to respond"));
    } finally {
      setRespondingId(null);
    }
  };

  const pendingInviteByGroup = new Map(invites.map((invite) => [invite.group_id, invite]));

  const notificationInvites = items
    .filter((n) => n.notification_type === "group_invite" && n.invite_status !== "stale")
    .map((n) => {
      const pending = n.group_id ? pendingInviteByGroup.get(n.group_id) : undefined;
      if (!n.group_id) return null;
      const inviteId = pending?.id || n.invite_id || `group:${n.group_id}`;
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

  // Render every group invite notification as actionable; if invite_id is absent,
  // the backend resolves the pending invite by group_id for the signed-in invitee.
  const inviteGroupIds = new Set(actionableInvites.map(i => i.group_id));
  const visibleNotifs = items.filter(n =>
    n.notification_type !== "group_invite" || (n.group_id && inviteGroupIds.has(n.group_id))
  );

  const unreadCount = items.filter(n => n.notification_type !== "group_invite" && !n.is_read).length
    + actionableInvites.filter((i) => !seenInvites.has(i.id)).length;
  const hasUnreadInTray = items.some((n) => !n.is_read);
  const isEmpty = visibleNotifs.length === 0 && actionableInvites.length === 0;

  const todayNotifs = visibleNotifs.filter((n) => isToday(new Date(n.created_at)));
  const earlierNotifs = visibleNotifs.filter((n) => !isToday(new Date(n.created_at)));

  const renderNotif = (n: Notification) => {
    const copy = friendlyNotification(n);
    return (
      <li
        key={n.id}
        className={`flex items-start gap-3 px-4 py-3 transition-colors duration-300 ${n.is_read ? "bg-transparent" : "bg-primary/5"}`}
      >
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.is_read ? "bg-muted" : "bg-primary/10"}`}>
          <BellRing className={`h-4 w-4 ${n.is_read ? "text-muted-foreground" : "text-primary"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm leading-snug ${n.is_read ? "font-medium text-foreground/70" : "font-semibold text-foreground"}`}>{copy.title}</p>
            {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
          </div>
          {copy.body && (
            <p className={`mt-0.5 text-xs leading-relaxed line-clamp-2 ${n.is_read ? "text-muted-foreground/80" : "text-muted-foreground"}`}>{copy.body}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
          </p>
        </div>
      </li>
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0 h-9 w-9" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85dvh] rounded-t-3xl bg-background p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-base">Notifications</SheetTitle>
              <p className="text-[10px] text-muted-foreground">Read alerts clear after 24 hours</p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!hasUnreadInTray && unreadCount === 0}
              className="mr-8 text-xs font-medium text-primary transition-opacity hover:opacity-80 disabled:text-muted-foreground disabled:opacity-60"
            >
              Mark all as read
            </button>
          </div>
        </SheetHeader>
        <ScrollArea className="flex-1">
          {loading && isEmpty ? (
            <div className="py-10 text-center text-xs text-muted-foreground">Loading…</div>
          ) : isEmpty ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                <Bell className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div>
              {actionableInvites.length > 0 && (
                <ul className="divide-y divide-border">
                  {actionableInvites.map((inv) => {
                    const g = inv.vfd_sandbox_groups;
                    return (
                      <li key={`inv-${inv.id}`} className="px-4 py-3 bg-primary/5">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <Users className="h-4 w-4 text-primary" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-snug">
                              {inv.inviter_name} invited you
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {g?.name || "Group"}
                              {g && ` • ₦${Number(g.contribution_amount).toLocaleString("en-NG")}/${g.period}`}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            className="h-9 flex-1 text-xs"
                            onClick={() => handleRespond(inv.id, true, inv.group_id, items.find(n => n.notification_type === "group_invite" && n.group_id === inv.group_id)?.id)}
                            disabled={respondingId === inv.id}
                          >
                            {respondingId === inv.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <><Check className="mr-1 h-3.5 w-3.5" />Accept</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 flex-1 text-xs"
                            onClick={() => handleRespond(inv.id, false, inv.group_id, items.find(n => n.notification_type === "group_invite" && n.group_id === inv.group_id)?.id)}
                            disabled={respondingId === inv.id}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />Decline
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {todayNotifs.length > 0 && (
                <section>
                  <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Today</p>
                  <ul className="divide-y divide-border">
                    {todayNotifs.filter((n) => n.notification_type !== "group_invite").map(renderNotif)}
                  </ul>
                </section>
              )}
              {earlierNotifs.length > 0 && (
                <section>
                  <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Earlier</p>
                  <ul className="divide-y divide-border">
                    {earlierNotifs.filter((n) => n.notification_type !== "group_invite").map(renderNotif)}
                  </ul>
                </section>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
