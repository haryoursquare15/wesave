import { motion } from "framer-motion";
import { Users, Calendar, Coins, Lock, ChevronRight, Trophy, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StarRating } from "./StarRating";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

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
  isCompleted?: boolean;
  isPending?: boolean;
  pendingRequests?: number;
  onClick?: () => void;
}

const periodLabels = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function ThriftGroupCard({
  id,
  name,
  rating,
  memberCount,
  maxMembers,
  contributionAmount,
  period,
  isMember = false,
  isActive = true,
  isCompleted = false,
  isPending = false,
  pendingRequests = 0,
  onClick,
}: ThriftGroupCardProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-NG").format(amount);
  };

  // Check if user has excellent badge (credit score >= 750)
  const hasExcellentBadge = (profile?.credit_score ?? 0) >= 750;
  
  // Groups in pool that need members - only excellent badge users can join
  const isPoolGroup = !isMember && memberCount < maxMembers;
  const canRequestToJoin = isPoolGroup && hasExcellentBadge;

  const handleClick = () => {
    if (isMember) {
      if (onClick) {
        onClick();
      } else {
        navigate(`/groups/${id}`);
      }
    }
  };

  // Determine card styling based on status
  const getCardStyle = () => {
    if (isCompleted) {
      return "border-success/50 bg-success/5"; // Completed cycle - green tint
    }
    if (isPending || (!isActive && memberCount < maxMembers)) {
      return "border-dashed border-muted-foreground/30"; // Pending/needs members
    }
    if (!isActive) {
      return "border-dashed border-muted-foreground/30"; // Pending
    }
    return ""; // Active
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: isMember || canRequestToJoin ? 1.02 : 1 }}
      whileTap={{ scale: isMember || canRequestToJoin ? 0.98 : 1 }}
      onClick={handleClick}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-5 shadow-md transition-all duration-200",
        isMember
          ? "cursor-pointer hover:shadow-lg hover:border-primary/30"
          : canRequestToJoin 
            ? "cursor-pointer hover:shadow-lg hover:border-primary/30"
            : "opacity-80",
        getCardStyle()
      )}
    >
      {/* Completed Badge Overlay */}
      {isCompleted && (
        <div className="absolute top-3 right-3">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20 text-success text-xs font-medium">
            <Trophy className="h-3 w-3" />
            Completed
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg text-foreground truncate">{name}</h3>
            {!isMember && !canRequestToJoin && <Lock className="h-4 w-4 text-muted-foreground" />}
            {isPoolGroup && !canRequestToJoin && (
              <Badge variant="outline" className="text-xs gap-1">
                <Star className="h-3 w-3" />
                Excellent only
              </Badge>
            )}
          </div>
          <StarRating rating={rating} size="sm" showValue />
        </div>
        {isMember && pendingRequests > 0 && !isCompleted && (
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
        <div className="flex items-center gap-2">
          <Badge 
            variant={isCompleted ? "success" : isActive ? "default" : "secondary"}
            className={isCompleted ? "bg-success text-success-foreground" : ""}
          >
            {isCompleted ? "All Cycles Complete" : isActive ? "Active Cycle" : memberCount < maxMembers ? "Needs Members" : "Pending"}
          </Badge>
          {isPoolGroup && memberCount < maxMembers && (
            <Badge variant="outline" className="text-xs">
              {maxMembers - memberCount} spots left
            </Badge>
          )}
        </div>
        {(isMember || canRequestToJoin) && (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
    </motion.div>
  );
}
