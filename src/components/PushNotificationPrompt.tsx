import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const { supported, permission, isSubscribed, loading, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem("wesave_push_dismissed");
    if (wasDismissed) setDismissed(true);
  }, []);

  if (!user || !supported || isSubscribed || permission === "denied" || dismissed) {
    return null;
  }

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      toast.success("Push notifications enabled!");
    } else if (Notification.permission === "denied") {
      toast.error("Notifications blocked. Enable them in your browser settings.");
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("wesave_push_dismissed", "true");
  };

  return (
    <div className="mx-4 mb-4 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
        <Bell className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Enable Notifications</p>
        <p className="text-xs text-muted-foreground">Get alerts for contributions, payouts & invites</p>
      </div>
      <Button size="sm" onClick={handleEnable} disabled={loading} className="flex-shrink-0">
        {loading ? "..." : "Enable"}
      </Button>
      <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
