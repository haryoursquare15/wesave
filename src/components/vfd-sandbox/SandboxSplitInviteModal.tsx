import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Receipt, Check, X, Loader2 } from "lucide-react";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";

interface SplitInvite {
  id: string;
  title?: string;
  total_amount?: number;
  per_person_amount?: number;
  fee_per_person?: number;
  split_count?: number;
  expiry_date?: string | null;
}

const SEEN_KEY = "vestara.splitInvitesAccepted";
export const OPEN_SPLIT_KEY = "vestara.openSplit";

const readSeen = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
};

/**
 * Shows a pop-up when someone adds the signed-in user to a split bill,
 * letting them Accept (open the split to pay) or Decline in-app.
 */
export function SandboxSplitInviteModal({ onOpenSplit }: { onOpenSplit?: () => void }) {
  const { listSplits, getSplitDetail, declineSplit } = useVfdSandboxProducts();
  const { session } = useSandboxAwareAuth();
  const userId = session?.user?.id;
  const { toast } = useToast();
  const [invites, setInvites] = useState<SplitInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const checked = useRef<Map<string, boolean>>(new Map());

  const refresh = useCallback(async () => {
    if (!userId) return;
    const res = await listSplits();
    const all = (res?.data || []) as any[];
    const seen = new Set(readSeen());
    const candidates = all.filter(s => s.creator_id !== userId && s.status === "active" && !seen.has(s.id)
      && !(s.expiry_date && new Date(s.expiry_date) < new Date()));
    const found: SplitInvite[] = [];
    for (const s of candidates.slice(0, 10)) {
      let pending = checked.current.get(s.id);
      if (pending === undefined) {
        const d = await getSplitDetail(s.id);
        const me = (d?.data?.participants || []).find((p: any) => p.user_id === userId);
        pending = me?.status === "pending";
        checked.current.set(s.id, pending);
      }
      if (pending) found.push(s);
    }
    setInvites(found);
    if (found.length > 0) setOpen(true);
  }, [userId, listSplits, getSplitDetail]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const removeCurrent = (id: string) => {
    const next = invites.filter(i => i.id !== id);
    setInvites(next);
    if (next.length === 0) setOpen(false);
  };

  const accept = (inv: SplitInvite) => {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...readSeen(), inv.id].slice(-100)));
    sessionStorage.setItem(OPEN_SPLIT_KEY, inv.id);
    toast({ title: "Split accepted", description: "Pay your share to complete it." });
    removeCurrent(inv.id);
    onOpenSplit?.();
  };

  const decline = async (inv: SplitInvite) => {
    setBusy(true);
    const res = await declineSplit(inv.id);
    setBusy(false);
    if (res?.error) {
      toast({ title: "Couldn't decline", description: "Please try again.", variant: "destructive" });
      return;
    }
    checked.current.set(inv.id, false);
    toast({ title: "Split declined" });
    removeCurrent(inv.id);
  };

  if (invites.length === 0) return null;
  const cur = invites[0];
  const share = Number(cur.per_person_amount || 0) + Number(cur.fee_per_person || 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <DialogTitle className="text-base">Split bill request</DialogTitle>
              <DialogDescription className="text-xs">You've been added to a split bill</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="p-3 rounded-xl bg-muted/40 space-y-2">
            <p className="font-semibold text-sm">{cur.title || "Split bill"}</p>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {cur.total_amount != null && <Badge variant="outline">Total ₦{Number(cur.total_amount).toLocaleString()}</Badge>}
              {cur.split_count != null && <Badge variant="outline">{cur.split_count} people</Badge>}
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-muted-foreground">Your share</span>
              <span className="text-lg font-bold text-primary">₦{share.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          {invites.length > 1 && (
            <p className="text-[11px] text-muted-foreground text-center">
              {invites.length - 1} more request{invites.length - 1 === 1 ? "" : "s"} after this
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" disabled={busy} onClick={() => decline(cur)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4 mr-1" /> Decline</>}
          </Button>
          <Button className="h-11" disabled={busy} onClick={() => accept(cur)}>
            <Check className="h-4 w-4 mr-1" /> Accept
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
