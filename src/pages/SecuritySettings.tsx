import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Smartphone, Key, Lock, AlertTriangle, ChevronRight, Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BottomNav } from "@/components/BottomNav";
import { TwoFactorSetup } from "@/components/security/TwoFactorSetup";
import { TwoFactorVerify } from "@/components/security/TwoFactorVerify";
import { DeviceManagement } from "@/components/security/DeviceManagement";
import { ChangePasswordDialog } from "@/components/security/ChangePasswordDialog";
import { useSecurity } from "@/hooks/useSecurity";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export default function SecuritySettings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { get2FAStatus, disable2FA, loading } = useSecurity();

  const withdrawalIntent = useMemo(() => {
    const action = searchParams.get("action");
    const amount = Number(searchParams.get("amount") || 0);
    if (action !== "withdraw" || !amount || amount <= 0) return null;
    return { amount };
  }, [searchParams]);

  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAVerifiedAt, setTwoFAVerifiedAt] = useState<string | null>(null);
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [showWithdrawVerify, setShowWithdrawVerify] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchStatus = async () => {
      const status = await get2FAStatus();
      setTwoFAEnabled(status.is_enabled);
      setTwoFAVerifiedAt(status.verified_at);
      setLoadingStatus(false);
    };

    if (user) {
      fetchStatus();
    }
  }, [user, get2FAStatus]);

  // If we arrived here to confirm a withdrawal, open the 2FA verify dialog.
  useEffect(() => {
    if (!user) return;
    if (withdrawalIntent) {
      setShowWithdrawVerify(true);
    }
  }, [user, withdrawalIntent]);

  const handleToggle2FA = () => {
    if (twoFAEnabled) {
      setShowDisable2FA(true);
    } else {
      setShowSetup2FA(true);
    }
  };

  const handle2FASetupComplete = async () => {
    const status = await get2FAStatus();
    setTwoFAEnabled(status.is_enabled);
    setTwoFAVerifiedAt(status.verified_at);
  };

  const handleDisable2FA = async (token: string) => {
    // Disable requires server-side action (verified token is passed)
    try {
      const result = await disable2FA(token);
      if (!result.success) throw new Error(result.error);
      setTwoFAEnabled(false);
      setTwoFAVerifiedAt(null);
      toast.success("2FA has been disabled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disable 2FA");
    }
  };

  const processWithdrawal = async (token: string) => {
    if (!withdrawalIntent) return;

    try {
      const { data, error } = await supabase.functions.invoke("flutterwave-payments", {
        body: {
          action: "withdraw_to_bank",
          amount: withdrawalIntent.amount,
          token,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        // Encourage OAuth upgrade when required
        if (data?.code === "google_required") {
          toast.error("Google sign-in is required for withdrawals. Redirecting…");
          await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
          return;
        }

        throw new Error(data?.error || "Withdrawal failed");
      }

      toast.success("Withdrawal initiated successfully");
      setShowWithdrawVerify(false);
      navigate("/wallet");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // Show friendly message — backend already sanitises, but catch edge cases
      if (msg.includes("FunctionsHttpError") || msg.includes("FunctionsFetchError")) {
        toast.error("Something went wrong. Please try again later.");
      } else {
        toast.error(msg || "We couldn't process your withdrawal. Please try again.");
      }
    }
  };

  if (authLoading || loadingStatus) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Security & Privacy</h1>
              <p className="text-sm text-muted-foreground">Protect your account</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Two-Factor Authentication */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Two-Factor Authentication</h3>
                <p className="text-sm text-muted-foreground">
                  {twoFAEnabled ? "Enabled" : "Add extra security to your account"}
                </p>
              </div>
              <Switch
                checked={twoFAEnabled}
                onCheckedChange={handleToggle2FA}
                disabled={loading}
              />
            </div>
          </div>

          {twoFAEnabled && (
            <div className="p-4 bg-success/5">
              <div className="flex items-center gap-2 text-success">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">Protected with 2FA</span>
              </div>
              {twoFAVerifiedAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Enabled on {new Date(twoFAVerifiedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </motion.div>

        {/* Device Management */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <button
            onClick={() => setShowDevices(true)}
            className="w-full bg-card rounded-xl border border-border p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-gold" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-foreground">Trusted Devices</h3>
                <p className="text-sm text-muted-foreground">Manage devices with access</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </motion.div>

        {/* Password */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={() => setShowChangePassword(true)}
            className="w-full bg-card rounded-xl border border-border p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Key className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-foreground">Change Password</h3>
                <p className="text-sm text-muted-foreground">Update your password</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </motion.div>

        {/* Withdrawal Limits */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-xl border border-border p-4"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-coral/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-coral" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Withdrawal Limits</h3>
              <p className="text-sm text-muted-foreground">Daily and monthly limits</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">Daily Limit</span>
              <span className="font-semibold text-foreground">₦500,000</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">Monthly Limit</span>
              <span className="font-semibold text-foreground">₦5,000,000</span>
            </div>
          </div>
        </motion.div>

        {/* Security Tips */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gold/10 rounded-xl border border-gold/20 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-gold mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground mb-2">Security Tips</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Enable 2FA for maximum protection</li>
                <li>• Never share your login credentials</li>
                <li>• Use a strong, unique password</li>
                <li>• Review trusted devices regularly</li>
              </ul>
            </div>
          </div>
        </motion.div>
      </main>

      <BottomNav />

      {/* Dialogs */}
      <TwoFactorSetup 
        open={showSetup2FA} 
        onOpenChange={setShowSetup2FA}
        onComplete={handle2FASetupComplete}
      />

      <TwoFactorVerify
        open={showDisable2FA}
        onOpenChange={setShowDisable2FA}
        purpose="disable_2fa"
        onVerified={handleDisable2FA}
      />

      <TwoFactorVerify
        open={showWithdrawVerify}
        onOpenChange={setShowWithdrawVerify}
        purpose="withdrawal"
        onVerified={processWithdrawal}
        onCancel={() => navigate("/wallet")}
      />

      <DeviceManagement
        open={showDevices}
        onOpenChange={setShowDevices}
      />

      <ChangePasswordDialog
        open={showChangePassword}
        onOpenChange={setShowChangePassword}
      />
    </div>
  );
}
