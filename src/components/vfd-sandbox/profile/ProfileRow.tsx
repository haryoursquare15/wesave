import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
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
  icon: Icon, label, helper, value, trailing, onClick, destructive, disabled, attention,
}: ProfileRowProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { onClick, type: "button" as const, disabled } : {})}
      className={cn(
        "premium-profile-row vm-setting-row w-full flex items-center text-left",
        onClick && !disabled && "vm-setting-row-action",
        destructive && "vm-setting-row-danger",
        attention && "premium-profile-row-attention",
        disabled && "opacity-60"
      )}
    >
      <span className="premium-profile-row-icon vm-setting-glyph shrink-0">
        <Icon size={19} strokeWidth={1.65} />
      </span>
      <div className="vm-setting-copy flex-1 min-w-0">
        <p className={cn("vm-setting-label", destructive && "text-destructive")}>{label}</p>
        {helper && <p className="vm-setting-helper">{helper}</p>}
        {attention && <span className="vm-setting-attention">{attention}</span>}
      </div>
      {value !== undefined && <div className="vm-setting-value">{value}</div>}
      {trailing !== undefined ? (
        <div className="vm-setting-trailing">{trailing}</div>
      ) : onClick ? (
        <ChevronRight className="vm-setting-arrow" size={18} aria-hidden="true" />
      ) : null}
    </Comp>
  );
}
