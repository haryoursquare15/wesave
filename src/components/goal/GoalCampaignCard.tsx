import { motion } from "framer-motion";
import { Users, Clock, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import type { GoalCampaign } from "@/hooks/useGoalCampaigns";

interface Props {
  campaign: GoalCampaign;
  showManage?: boolean;
}

export function GoalCampaignCard({ campaign, showManage }: Props) {
  const progress = campaign.goal_amount > 0
    ? (campaign.amount_raised / campaign.goal_amount) * 100
    : 0;

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border overflow-hidden"
    >
      {campaign.campaign_image && (
        <div className="h-40 bg-muted">
          <img
            src={campaign.campaign_image}
            alt={campaign.campaign_title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      {!campaign.campaign_image && (
        <div className="h-32 bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
          <Target className="h-10 w-10 text-primary/40" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-foreground line-clamp-1">{campaign.campaign_title}</h3>
          <Badge variant={campaign.campaign_status === "active" ? "default" : "secondary"}>
            {campaign.campaign_status}
          </Badge>
        </div>

        {campaign.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{campaign.description}</p>
        )}

        <div className="space-y-2 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Raised</span>
            <span className="font-semibold text-foreground">
              ₦{fmt(campaign.amount_raised)} of ₦{fmt(campaign.goal_amount)}
            </span>
          </div>
          <Progress value={Math.min(progress, 100)} className="h-2" />
          <p className="text-xs text-right font-medium text-primary">{progress.toFixed(0)}%</p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {campaign.contributor_count} contributors
            </span>
            {campaign.campaign_deadline && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(campaign.campaign_deadline), "MMM d, yyyy")}
              </span>
            )}
          </div>
          <Link to={`/goal-funding/${campaign.id}`}>
            <Button size="sm" variant={showManage ? "default" : "outline"}>
              {showManage ? "Manage" : "View"}
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
