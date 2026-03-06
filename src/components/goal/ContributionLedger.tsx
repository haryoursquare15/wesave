import { useState } from "react";
import { Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { exportToCSV } from "@/lib/exportUtils";
import type { GoalContribution, GoalCampaign } from "@/hooks/useGoalCampaigns";

interface Props {
  contributions: GoalContribution[];
  campaign: GoalCampaign;
  isOwner: boolean;
}

type SortMode = "latest" | "highest" | "confirmed";

export function ContributionLedger({ contributions, campaign, isOwner }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>("latest");

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  const sorted = [...contributions].sort((a, b) => {
    if (sortMode === "highest") return b.contribution_amount - a.contribution_amount;
    if (sortMode === "confirmed") {
      if (a.contribution_status === "confirmed" && b.contribution_status !== "confirmed") return -1;
      if (b.contribution_status === "confirmed" && a.contribution_status !== "confirmed") return 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const totalConfirmed = contributions
    .filter(c => c.contribution_status === "confirmed")
    .reduce((s, c) => s + c.contribution_amount, 0);

  const handleExport = () => {
    exportToCSV(
      contributions.map(c => ({
        Contributor: c.anonymous ? "Anonymous" : (c.contributor_name || "Unknown"),
        Amount: c.contribution_amount,
        Status: c.contribution_status,
        Reference: c.contribution_reference || "",
        Date: format(new Date(c.created_at), "yyyy-MM-dd HH:mm"),
      })),
      `goal-funding-${campaign.campaign_slug || campaign.id}`
    );
  };

  return (
    <div className="space-y-4">
      {/* Disclaimer */}
      <div className="p-3 rounded-lg bg-muted/30 border border-border">
        <p className="text-xs text-muted-foreground">
          Contribution records are provided for transparency. Payments are made directly to the campaign beneficiary account.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-card border border-border text-center">
          <p className="text-xs text-muted-foreground">Total Raised</p>
          <p className="text-lg font-bold text-foreground">₦{fmt(campaign.amount_raised)}</p>
        </div>
        <div className="p-3 rounded-lg bg-card border border-border text-center">
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className="text-lg font-bold text-foreground">
            ₦{fmt(Math.max(0, campaign.goal_amount - campaign.amount_raised))}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-card border border-border text-center">
          <p className="text-xs text-muted-foreground">Contributors</p>
          <p className="text-lg font-bold text-foreground">{campaign.contributor_count}</p>
        </div>
        <div className="p-3 rounded-lg bg-card border border-border text-center">
          <p className="text-xs text-muted-foreground">Goal</p>
          <p className="text-lg font-bold text-foreground">₦{fmt(campaign.goal_amount)}</p>
        </div>
      </div>

      {/* Filters & Export */}
      <div className="flex items-center justify-between">
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-3 w-3 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Latest</SelectItem>
            <SelectItem value="highest">Highest</SelectItem>
            <SelectItem value="confirmed">Confirmed Only</SelectItem>
          </SelectContent>
        </Select>

        {isOwner && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
        )}
      </div>

      {/* Ledger entries */}
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-center py-6 text-muted-foreground text-sm">No contributions yet</p>
        ) : (
          sorted.map((c) => {
            const name = c.anonymous
              ? "Anonymous Contributor"
              : (c.contributor_name || "Unknown");

            return (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(c.created_at), "MMM d, yyyy · h:mm a")}
                  </p>
                  {c.contribution_reference && (
                    <p className="text-xs text-muted-foreground mt-0.5">Ref: {c.contribution_reference}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">₦{fmt(c.contribution_amount)}</p>
                  <Badge
                    variant={c.contribution_status === "confirmed" ? "default" : "secondary"}
                    className="text-[10px] mt-1"
                  >
                    {c.contribution_status}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
