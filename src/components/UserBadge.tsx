import { Crown, Medal, Award, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type BadgeType = "gold" | "silver" | "bronze" | "newbie";

interface UserBadgeProps {
  type: BadgeType;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const badgeConfig = {
  gold: {
    icon: Crown,
    label: "Gold Member",
    bgClass: "bg-gradient-to-br from-gold to-amber-400",
    textClass: "text-gold-foreground",
  },
  silver: {
    icon: Medal,
    label: "Silver Member",
    bgClass: "bg-gradient-to-br from-silver to-slate-400",
    textClass: "text-silver-foreground",
  },
  bronze: {
    icon: Award,
    label: "Bronze Member",
    bgClass: "bg-gradient-to-br from-bronze to-orange-600",
    textClass: "text-bronze-foreground",
  },
  newbie: {
    icon: Star,
    label: "Newbie",
    bgClass: "bg-gradient-to-br from-muted to-secondary",
    textClass: "text-muted-foreground",
  },
};

const sizeConfig = {
  sm: { container: "h-6 w-6", icon: 12, text: "text-xs" },
  md: { container: "h-8 w-8", icon: 16, text: "text-sm" },
  lg: { container: "h-12 w-12", icon: 24, text: "text-base" },
};

export function UserBadge({ type, size = "md", showLabel = false }: UserBadgeProps) {
  const config = badgeConfig[type];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "rounded-full flex items-center justify-center shadow-md",
          config.bgClass,
          sizeStyles.container
        )}
      >
        <Icon size={sizeStyles.icon} className={config.textClass} />
      </div>
      {showLabel && (
        <span className={cn("font-medium", sizeStyles.text, "text-foreground")}>
          {config.label}
        </span>
      )}
    </div>
  );
}
