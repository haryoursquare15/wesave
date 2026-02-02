import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
}

const sizeConfig = {
  sm: { icon: 12, gap: "gap-0.5" },
  md: { icon: 16, gap: "gap-1" },
  lg: { icon: 20, gap: "gap-1" },
};

export function StarRating({
  rating,
  maxRating = 5,
  size = "md",
  showValue = false,
}: StarRatingProps) {
  const sizeStyles = sizeConfig[size];

  return (
    <div className={cn("flex items-center", sizeStyles.gap)}>
      {Array.from({ length: maxRating }).map((_, index) => (
        <Star
          key={index}
          size={sizeStyles.icon}
          className={cn(
            "transition-colors",
            index < rating
              ? "fill-gold text-gold"
              : "fill-muted text-muted-foreground/30"
          )}
        />
      ))}
      {showValue && (
        <span className="ml-1 text-sm font-medium text-muted-foreground">
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
