import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible Radix switch with a distinct app treatment.
 * Keep its checked/onCheckedChange contract for biometrics, alerts, and preferences.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    {...props}
    ref={ref}
    className={cn(
      "vm-switch peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors duration-200 data-[state=checked]:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
  >
    <span aria-hidden="true" className="vm-switch-label vm-switch-label-on">ON</span>
    <span aria-hidden="true" className="vm-switch-label vm-switch-label-off">OFF</span>
    <SwitchPrimitives.Thumb className="vm-switch-thumb pointer-events-none relative z-[1] flex items-center justify-center rounded-full bg-background shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0">
      <Check className="vm-switch-tick" size={13} strokeWidth={2.5} aria-hidden="true" />
    </SwitchPrimitives.Thumb>
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
