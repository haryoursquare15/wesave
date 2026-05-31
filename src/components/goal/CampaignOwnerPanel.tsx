import { useState } from "react";
import { CheckCircle, XCircle, MessageSquare, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import type { GoalContribution, GoalCampaign } from "@/hooks/useGoalCampaigns";

import { getUserFriendlyError } from "@/lib/errorMessages";
interface Props {
  campaign: GoalCampaign;
  contributions: GoalContribution[];
  onRefresh: () => void;
}

export function CampaignOwnerPanel({ campaign, contributions, onRefresh }: Props) {
  const { user } = useAuth();
  const [updateMsg, setUpdateMsg] = useState("");
  const [posting, setPosting] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  const handleConfirm = async (contrib: GoalContribution) => {
    setConfirming(contrib.id);
    try {
      await (supabase as any)
        .from("goal_contributions")
        .update({ contribution_status: "confirmed" })
        .eq("id", contrib.id);

      toast.success("Contribution confirmed");
      onRefresh();
    } catch (err: any) {
      toast.error(getUserFriendlyError(err.message || "Failed to confirm"));
    } finally {
      setConfirming(null);
    }
  };

  const handlePostUpdate = async () => {
    if (!updateMsg.trim() || !user) return;
    setPosting(true);
    try {
      await (supabase as any).from("campaign_updates").insert({
        campaign_id: campaign.id,
        update_message: updateMsg.trim(),
        created_by: user.id,
      });
      setUpdateMsg("");
      toast.success("Update posted");
      onRefresh();
    } catch (err: any) {
      toast.error(getUserFriendlyError(err.message || "Failed to post update"));
    } finally {
      setPosting(false);
    }
  };

  const handleClose = async () => {
    try {
      await (supabase as any)
        .from("goal_campaigns")
        .update({ campaign_status: "closed" })
        .eq("id", campaign.id);
      toast.success("Campaign closed");
      onRefresh();
    } catch (err: any) {
      toast.error(getUserFriendlyError(err.message || "Failed to close campaign"));
    }
  };

  const pending = contributions.filter(c => c.contribution_status === "pledged");

  return (
    <div className="space-y-6">
      {/* Pending confirmations */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Pending Confirmations ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending contributions</p>
        ) : (
          <div className="space-y-2">
            {pending.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {c.anonymous ? "Anonymous" : (c.contributor_name || "Unknown")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ₦{fmt(c.contribution_amount)} · {format(new Date(c.created_at), "MMM d")}
                  </p>
                  {c.contribution_reference && (
                    <p className="text-xs text-muted-foreground">Ref: {c.contribution_reference}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => handleConfirm(c)}
                  disabled={confirming === c.id}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Confirm
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post update */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Post Campaign Update</h3>
        <Textarea
          placeholder="Share a progress update..."
          value={updateMsg}
          onChange={(e) => setUpdateMsg(e.target.value)}
          rows={3}
        />
        <Button
          className="mt-2 w-full"
          onClick={handlePostUpdate}
          disabled={posting || !updateMsg.trim()}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Post Update
        </Button>
      </div>

      {/* Close campaign */}
      {campaign.campaign_status === "active" && (
        <Button variant="destructive" className="w-full" onClick={handleClose}>
          <Lock className="h-4 w-4 mr-2" />
          Close Campaign
        </Button>
      )}
    </div>
  );
}
