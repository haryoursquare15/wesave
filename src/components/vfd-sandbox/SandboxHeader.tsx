import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import vestaraLogoUrl from "@/assets/vestara-logo-transparent.png";
const vestaraLogo = { url: vestaraLogoUrl };
import { SandboxNotificationBell } from "./SandboxNotificationBell";
import { BillDeliveryPopupListener } from "./BillDeliveryPopupListener";

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
    <div className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="max-w-lg mx-auto px-4 py-2 flex items-center gap-2">
        {showBack && (
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1 flex items-center">
          <img src={vestaraLogo.url} alt="Vestara" className="h-8 w-auto max-w-[160px] object-contain" />
        </div>
        <SandboxNotificationBell />
        {right}
      </div>
      <BillDeliveryPopupListener />
    </div>
  );
}
