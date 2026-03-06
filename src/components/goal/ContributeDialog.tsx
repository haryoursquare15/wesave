import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Check, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { GoalCampaign } from "@/hooks/useGoalCampaigns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: GoalCampaign;
  onSuccess: () => void;
}

export function ContributeDialog({ open, onOpenChange, campaign, onSuccess }: Props) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!user) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from("goal_contributions").insert({
        campaign_id: campaign.id,
        contributor_user_id: user.id,
        contributor_name: anonymous ? null : (profile?.full_name || profile?.username || "Anonymous"),
        contribution_amount: numAmount,
        contribution_reference: reference || null,
        contribution_status: "pledged",
        anonymous,
      });

      if (error) throw error;

      // Update campaign raised amount and contributor count
      await (supabase as any)
        .from("goal_campaigns")
        .update({
          amount_raised: campaign.amount_raised + numAmount,
          contributor_count: campaign.contributor_count + 1,
        })
        .eq("id", campaign.id);

      toast.success("Contribution recorded! Awaiting confirmation.");
      setStep(1);
      setAmount("");
      setReference("");
      setAnonymous(false);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to record contribution");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Contribute to Campaign</DialogTitle>
          <DialogDescription>
            Payments go directly to the campaign beneficiary.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Contribution Amount (₦)</Label>
              <Input
                type="number"
                placeholder="e.g. 5000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={1}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="anonymous"
                checked={anonymous}
                onCheckedChange={(v) => setAnonymous(!!v)}
              />
              <Label htmlFor="anonymous" className="text-sm">Contribute anonymously</Label>
            </div>
            <Button
              className="w-full"
              onClick={() => setStep(2)}
              disabled={!amount || parseFloat(amount) <= 0}
            >
              Next: View Bank Details
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
              <p className="text-sm font-medium text-foreground">Transfer ₦{fmt(parseFloat(amount))} to:</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Bank</span>
                  <span className="text-sm font-medium text-foreground">
                    {campaign.beneficiary_bank_name || "Not set"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Account</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium text-foreground">
                      {campaign.beneficiary_account_number || "Not set"}
                    </span>
                    {campaign.beneficiary_account_number && (
                      <button onClick={() => handleCopy(campaign.beneficiary_account_number!)}>
                        {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Name</span>
                  <span className="text-sm font-medium text-foreground">
                    {campaign.beneficiary_account_name || "Not set"}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <Label>Payment Reference (optional)</Label>
              <Input
                placeholder="e.g. transfer reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Recording..." : "I've Made the Transfer"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
