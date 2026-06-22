import { motion } from "framer-motion";
import { 
  ArrowLeft, User, Shield, CreditCard, Bell, HelpCircle, 
  ChevronRight, MessageSquare, ExternalLink, LogOut 
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const settingsItems = [
  { icon: User, label: "Edit Profile", path: "/settings/profile", description: "Update your personal information" },
  { icon: Shield, label: "Security & Privacy", path: "/settings/security", description: "Manage 2FA, devices, and privacy" },
  { icon: CreditCard, label: "Payment Methods", path: "/settings/payments", description: "Bank accounts and payment options" },
  { icon: Bell, label: "Notifications", path: "/settings/notifications", description: "Control how you receive updates" },
];

const supportItems = [
  { icon: HelpCircle, label: "Help Center", path: "/help", description: "FAQs and how-to guides" },
  { icon: MessageSquare, label: "Contact Support", path: "/support/new", description: "Lodge a complaint or get help" },
];

function PushNotificationSettings() {
  const { supported, permission, isSubscribed, loading, subscribe, unsubscribe } = usePushNotifications();

  if (!supported) return null;

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      const success = await subscribe();
      if (success) {
        toast.success("Push notifications enabled!");
      } else if (Notification.permission === "denied") {
        toast.error("Notifications blocked. Please enable them in your browser settings.");
      }
    } else {
      await unsubscribe();
      toast.success("Push notifications disabled");
    }
  };

  return (
    <section>
      <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">Notifications</h2>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-card rounded-2xl border border-border p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Push Notifications</p>
              <p className="text-xs text-muted-foreground">
                {permission === "denied"
                  ? "Blocked in browser settings"
                  : isSubscribed
                  ? "You'll receive alerts even when the app is closed"
                  : "Get notified about contributions, payouts & invites"}
              </p>
            </div>
          </div>
          <Switch
            checked={isSubscribed}
            onCheckedChange={handleToggle}
            disabled={loading || permission === "denied"}
          />
        </div>
      </motion.div>
    </section>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.success("Signed out successfully");
      navigate("/");
    } catch (err) {
      toast.error("Failed to sign out");
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">Settings</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Account Settings */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">Account Settings</h2>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-2xl border border-border divide-y divide-border"
          >
            {settingsItems.map((item, index) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            ))}
          </motion.div>
        </section>

        {/* Support */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">Support</h2>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-2xl border border-border divide-y divide-border"
          >
            {supportItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-gold" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            ))}
          </motion.div>
        </section>

        {/* Sign Out */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
        >
          <Button
            variant="outline"
            className="w-full h-12 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <div className="h-4 w-4 border-2 border-destructive/30 border-t-destructive rounded-full animate-spin mr-2" />
            ) : (
              <LogOut className="h-4 w-4 mr-2" />
            )}
            Sign Out
          </Button>
        </motion.div>

        <PushNotificationSettings />

        {/* App Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center text-sm text-muted-foreground pt-4 space-y-1"
        >
          <p>Vestara v1.0.0</p>
          <p>© 2025 Vestara. All rights reserved.</p>
          <p>Owned by LLH Premium Enterprise. Technology supported by Flutterwave.</p>
          <p>Contact: 09039479954 | IG: @Vestara.ng</p>
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}
