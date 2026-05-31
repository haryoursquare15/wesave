import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import type { TargetAjoGroup } from "@/hooks/useTargetAjo";

import { getUserFriendlyError } from "@/lib/errorMessages";
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: TargetAjoGroup;
  onSuccess: () => void;
}

export function TargetAjoContributeDialog({ open, onOpenChange, group, onSuccess }: Props) {
  const { user, wallet } = useAuth();
  const [amount, setAmount] = useState(group.contribution_amount.toString());
  const [submitting, setSubmitting] = useState(false);

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);
  const walletBalance = Number(wallet?.available_balance) || 0;

  const handleContribute = async () => {
    if (!user) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 100) { toast.error("Minimum ₦100"); return; }
    if (amt > walletBalance) { toast.error("Insufficient wallet balance"); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("process_target_ajo_contribution" as any, {
        _group_id: group.id,
        _user_id: user.id,
        _amount: amt,
      } as any);

      if (error) throw error;

      const result = data as { success: boolean; error?: string; target_reached?: boolean };

      if (!result.success) {
        toast.error(getUserFriendlyError(result.error || "Contribution failed"));
        return;
      }

      if (result.target_reached) {
        toast.success(`₦${fmt(amt)} contributed! 🎯 Target achieved!`);
      } else {
        toast.success(`₦${fmt(amt)} contributed!`);
      }
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(getUserFriendlyError(err.message || "Failed to contribute"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Contribute to Target</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/30 flex items-center gap-3">
            <Wallet className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Wallet Balance</p>
              <p className="font-semibold text-foreground">₦{fmt(walletBalance)}</p>
            </div>
          </div>

          <div>
            <Label>Amount (₦)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={100}
              placeholder="Enter amount"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Suggested: ₦{fmt(group.contribution_amount)}
            </p>
          </div>

          <Button className="w-full" onClick={handleContribute} disabled={submitting}>
            {submitting ? "Processing..." : `Contribute ₦${fmt(parseFloat(amount) || 0)}`}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Funds will be deducted from your wallet balance.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
