import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ProfileRowProps {
  icon: LucideIcon;
  label: string;
  helper?: string;
  value?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  attention?: string;
}

export function ProfileRow({
  icon: Icon,
  label,
  helper,
  value,
  trailing,
  onClick,
  destructive,
  disabled,
  attention,
}: ProfileRowProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { onClick, type: "button" as const, disabled } : {})}
      className={cn(
        "premium-profile-row w-full flex items-center gap-3 px-4 min-h-[56px] text-left transition-colors",
        onClick && !disabled && "active:bg-muted/60 hover:bg-muted/40",
        destructive && "bg-destructive/5",
        attention && "premium-profile-row-attention",
        disabled && "opacity-60"
      )}
    >
      <span
        className={cn(
          "premium-profile-row-icon h-9 w-9 shrink-0 rounded-full flex items-center justify-center",
          destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="h-4.5 w-4.5" size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium truncate", destructive ? "text-destructive" : "text-foreground")}>
          {label}
        </p>
        {helper && <p className="text-xs text-muted-foreground truncate">{helper}</p>}
        {attention && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {attention}
          </span>
        )}
      </div>
      {value !== undefined && (
        <div className="text-sm text-muted-foreground max-w-[55%] truncate text-right">{value}</div>
      )}
      {trailing !== undefined ? (
        <div className="shrink-0">{trailing}</div>
      ) : onClick ? (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : null}
    </Comp>
  );
}
