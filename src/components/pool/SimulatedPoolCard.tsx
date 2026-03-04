import { motion } from "framer-motion";
import { Users, Calendar, Coins, Lock, Trophy, Clock, Star, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { StarRating } from "@/components/StarRating";
import {
  type SimulatedGroup,
  getStatusBg,
  getBadgeColor,
  formatNaira,
} from "@/lib/simulatedPoolData";
import { cn } from "@/lib/utils";

interface SimulatedPoolCardProps {
  group: SimulatedGroup;
  userBadge?: string;
  index: number;
}

const statusLabels: Record<SimulatedGroup["status"], string> = {
  active: "Active",
  almost_full: "Almost Full",
  full: "Group Full",
  upcoming: "Upcoming",
  completed: "Completed",
};

const statusVariants: Record<SimulatedGroup["status"], "default" | "warning" | "success" | "secondary"> = {
  active: "default",
  almost_full: "warning",
  full: "success",
  upcoming: "secondary",
  completed: "success",
};

export function SimulatedPoolCard({ group, userBadge = "silver", index }: SimulatedPoolCardProps) {
  const badgeRanking: Record<string, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };
  const userRank = badgeRanking[userBadge] ?? 0;
  const requiredRank = badgeRanking[group.badgeRequired] ?? 0;
  const canJoin = userRank >= requiredRank && group.status !== "full" && group.status !== "completed";
  const slotsLeft = group.maxMembers - group.memberCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 shadow-sm transition-all duration-200",
        getStatusBg(group.status),
        canJoin && "hover:shadow-md hover:border-primary/40 cursor-pointer"
      )}
    >
      {/* Completed overlay */}
      {group.status === "completed" && (
        <div className="absolute top-3 right-3">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/20 text-success text-xs font-medium">
            <Trophy className="h-3 w-3" />
            Completed
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
          <AvatarImage src={group.adminAvatar} alt={group.adminName} />
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {group.adminName.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate text-sm">{group.name}</h3>
          <p className="text-xs text-muted-foreground">by {group.adminName}</p>
        </div>
        <Badge className={cn("text-[10px] px-1.5 py-0.5 font-medium border-0", getBadgeColor(group.badgeRequired))}>
          <Shield className="h-2.5 w-2.5 mr-0.5" />
          {group.badgeRequired.charAt(0).toUpperCase() + group.badgeRequired.slice(1)}
        </Badge>
      </div>

      {/* Rating */}
      {group.rating > 0 && (
        <div className="mb-3">
          <StarRating rating={group.rating} size="sm" showValue />
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Coins className="h-3.5 w-3.5" />
          <span>₦{formatNaira(group.contributionAmount)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>{group.cycleDuration}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{group.memberCount}/{group.maxMembers}</span>
        </div>
      </div>

      {/* Member progress bar */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[11px] text-muted-foreground">Members</span>
          <span className="text-[11px] font-medium text-foreground">
            {group.completionPercent}%
          </span>
        </div>
        <Progress
          value={group.completionPercent}
          className="h-2"
        />
      </div>

      {/* Countdown for upcoming */}
      {group.status === "upcoming" && group.startsIn && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 bg-muted/30 rounded-lg px-2.5 py-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>Starts in <span className="font-medium text-foreground">{group.startsIn}</span></span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <Badge variant={statusVariants[group.status]}>
          {statusLabels[group.status]}
          {group.status === "almost_full" && slotsLeft > 0 && ` · ${slotsLeft} left`}
        </Badge>

        <TooltipProvider>
          {group.status === "full" || group.status === "completed" ? (
            <Button size="sm" variant="secondary" disabled className="text-xs h-7 px-3">
              {group.status === "full" ? "Group Full" : "Completed"}
            </Button>
          ) : canJoin ? (
            <Button size="sm" className="text-xs h-7 px-3">
              Join Now
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" disabled className="text-xs h-7 px-3 gap-1">
                  <Lock className="h-3 w-3" />
                  Locked
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Upgrade to {group.badgeRequired.charAt(0).toUpperCase() + group.badgeRequired.slice(1)} Badge to join this group.</p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>

      {/* Simulated indicator */}
      <div className="absolute bottom-1 right-2 text-[8px] text-muted-foreground/30 select-none">
        demo
      </div>
    </motion.div>
  );
}
