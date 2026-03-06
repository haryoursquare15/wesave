import { motion, AnimatePresence } from "framer-motion";
import { Heart, TrendingUp, CheckCircle, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { GoalContribution, CampaignUpdate } from "@/hooks/useGoalCampaigns";

interface Props {
  contributions: GoalContribution[];
  updates: CampaignUpdate[];
  visibility: string;
}

interface FeedItem {
  id: string;
  type: "contribution" | "update" | "milestone";
  message: string;
  time: string;
}

export function CampaignActivityFeed({ contributions, updates, visibility }: Props) {
  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  const items: FeedItem[] = [];

  contributions.forEach((c) => {
    const name = c.anonymous || visibility === "anonymous"
      ? "Anonymous"
      : (c.contributor_name || "Someone");
    const verb = c.contribution_status === "confirmed" ? "contributed" : "pledged";
    items.push({
      id: c.id,
      type: "contribution",
      message: `${name} ${verb} ₦${fmt(c.contribution_amount)}`,
      time: c.created_at,
    });
  });

  updates.forEach((u) => {
    items.push({
      id: u.id,
      type: "update",
      message: u.update_message,
      time: u.created_at,
    });
  });

  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const getIcon = (type: string) => {
    switch (type) {
      case "contribution": return <Heart className="h-4 w-4 text-primary" />;
      case "update": return <MessageSquare className="h-4 w-4 text-secondary" />;
      case "milestone": return <TrendingUp className="h-4 w-4 text-accent-foreground" />;
      default: return <CheckCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-center py-6 text-sm text-muted-foreground">
        No activity yet. Be the first to contribute!
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      <AnimatePresence>
        {items.slice(0, 20).map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border"
          >
            <div className="mt-0.5">{getIcon(item.type)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{item.message}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(item.time), { addSuffix: true })}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
