import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Check, X, Loader2 } from "lucide-react";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useToast } from "@/hooks/use-toast";

interface PendingInvite {
  id: string;
  group_id: string;
  inviter_id: string;
  inviter_name?: string;
  vfd_sandbox_groups?: {
    id: string;
    name: string;
    contribution_amount: number;
    period: string;
    max_members: number;
    member_count: number;
  };
}

/**
 * Polls for pending group invites and surfaces them in a modal so that
 * recipients can Accept or Decline directly. A success toast is shown on
 * accept, and the modal automatically advances to the next pending invite.
 */
export function SandboxGroupInviteModal({ onAccepted }: { onAccepted?: () => void }) {
  const products = useVfdSandboxProducts();
  const { toast } = useToast();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await products.listGroupInvites();
    if (res?.data) {
      setInvites(res.data as PendingInvite[]);
      if ((res.data as PendingInvite[]).length > 0) setOpen(true);
    }
  }, [products]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20000); // poll every 20s
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const respond = async (invite: PendingInvite, accept: boolean) => {
    setBusyId(invite.id);
    const res = await products.respondGroupInvite(invite.id, accept);
    setBusyId(null);
    if (res?.data) {
      if (accept) {
        toast({
          title: "Invite accepted!",
          description: `You joined "${invite.vfd_sandbox_groups?.name}". ${
            res.data.is_full ? "The group is now full — randomization in progress." : ""
          }`,
        });
        onAccepted?.();
      } else {
        toast({ title: "Invite declined" });
      }
      const next = invites.filter(i => i.id !== invite.id);
      setInvites(next);
      if (next.length === 0) setOpen(false);
    }
  };

  if (invites.length === 0) return null;

  const current = invites[0];
  const g = current.vfd_sandbox_groups;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">Group Invite</DialogTitle>
              <DialogDescription className="text-xs">
                {current.inviter_name || "A member"} invited you to a thrift group
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="p-3 rounded-xl bg-muted/40 space-y-2">
            <p className="font-semibold text-sm">{g?.name || "Thrift group"}</p>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {g?.contribution_amount != null && (
                <Badge variant="outline">
                  ₦{Number(g.contribution_amount).toLocaleString()} / {g.period}
                </Badge>
              )}
              {g?.member_count != null && g?.max_members != null && (
                <Badge variant="outline">
                  {g.member_count}/{g.max_members} members
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Once the group is full, payout positions are randomized and you'll
              have 3 minutes to swap before the thrift starts.
            </p>
          </div>

          {invites.length > 1 && (
            <p className="text-[11px] text-muted-foreground text-center">
              {invites.length - 1} more invite{invites.length - 1 === 1 ? "" : "s"} after this
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => respond(current, false)}
            disabled={busyId === current.id}
            className="h-11"
          >
            {busyId === current.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4 mr-1" /> Decline</>}
          </Button>
          <Button
            onClick={() => respond(current, true)}
            disabled={busyId === current.id}
            className="h-11"
          >
            {busyId === current.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Accept</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
