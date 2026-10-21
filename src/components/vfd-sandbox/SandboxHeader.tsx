import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import vestaraLogo from "@/assets/vestara-logo-transparent.png";
import { SandboxNotificationBell } from "./SandboxNotificationBell";
import { BillDeliveryPopupListener } from "./BillDeliveryPopupListener";
import { PushSubscriptionSync } from "./PushSubscriptionSync";

interface SandboxHeaderProps {
  /** Hidden on the home screen. */
  showBack?: boolean;
  onBack?: () => void;
  /** Extra controls on the right, e.g. the profile menu. */
  right?: ReactNode;
}

export function SandboxHeader({ showBack = true, onBack, right }: SandboxHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) return onBack();
    navigate("/app");
  };

  return (
    <header className="vestara-app-header at-header vm-header sticky top-0 z-20">
      <div className="at-header-inner vm-header-inner flex items-center gap-2">
        {showBack && (
          <Button variant="ghost" size="icon" onClick={handleBack} className="vm-header-back shrink-0" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="at-header-brand vm-header-brand flex-1 flex items-center"><img src={vestaraLogo} alt="Vestara" className="vestara-brand-logo h-8 w-auto max-w-[180px] object-contain" /><span className="vm-header-edition">PERSONAL BANKING <i /> EST. 2026</span></div>
        <div className="vm-header-actions"><SandboxNotificationBell />
        {right}</div>
      </div>
      <BillDeliveryPopupListener />
      <PushSubscriptionSync />
    </header>
  );
}
