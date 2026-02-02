import { motion } from "framer-motion";
import { Users, Calendar, Coins, Lock, ChevronRight } from "lucide-react";
import { StarRating } from "./StarRating";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

interface ThriftGroupCardProps {
  id: string;
  name: string;
  rating: number;
  memberCount: number;
  maxMembers: number;
  contributionAmount: number;
  period: "daily" | "weekly" | "monthly";
  isMember?: boolean;
  isActive?: boolean;
  pendingRequests?: number;
  onClick?: () => void;
}

const periodLabels = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function ThriftGroupCard({
  name,
  rating,
  memberCount,
  maxMembers,
  contributionAmount,
  period,
  isMember = false,
  isActive = true,
  pendingRequests = 0,
  onClick,
}: ThriftGroupCardProps) {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-NG").format(amount);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: isMember ? 1.02 : 1 }}
      whileTap={{ scale: isMember ? 0.98 : 1 }}
      onClick={isMember ? onClick : undefined}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-5 shadow-md transition-all duration-200",
        isMember
          ? "cursor-pointer hover:shadow-lg hover:border-primary/30"
          : "opacity-80",
        !isActive && "border-dashed"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg text-foreground truncate">{name}</h3>
            {!isMember && <Lock className="h-4 w-4 text-muted-foreground" />}
          </div>
          <StarRating rating={rating} size="sm" showValue />
        </div>
        {isMember && pendingRequests > 0 && (
          <Badge variant="warning" className="ml-2">
            {pendingRequests} pending
          </Badge>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span className="text-sm">
            {memberCount}/{maxMembers}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Coins className="h-4 w-4" />
          <span className="text-sm">₦{formatAmount(contributionAmount)}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span className="text-sm">{periodLabels[period]}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <Badge variant={isActive ? "success" : "secondary"}>
          {isActive ? "Active Cycle" : "Cycle Complete"}
        </Badge>
        {isMember && (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
    </motion.div>
  );
}
