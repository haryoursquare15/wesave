import { useState, useEffect, useCallback } from "react";
import { Shield, Smartphone, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSecurity } from "@/hooks/useSecurity";
import { useAuth } from "@/contexts/AuthContext";
import { TwoFactorSetup } from "./TwoFactorSetup";

interface TwoFactorEnforcementProps {
  onComplete: () => void;
}

export function TwoFactorEnforcement({ onComplete }: TwoFactorEnforcementProps) {
  const { user } = useAuth();
  const { get2FAStatus } = useSecurity();
  const [checking, setChecking] = useState(true);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    const check2FAStatus = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        const status = await get2FAStatus();
        if (!status.is_enabled) {
          setNeeds2FA(true);
        } else {
          // 2FA is already enabled, proceed
          onComplete();
        }
      } catch (err) {
        console.error("Error checking 2FA status:", err);
        // On error, allow through but log it
        onComplete();
      } finally {
        setChecking(false);
      }
    };

    check2FAStatus();
  }, [user, get2FAStatus, onComplete]);

  const handleSetupComplete = useCallback(() => {
    setShowSetup(false);
    setNeeds2FA(false);
    onComplete();
  }, [onComplete]);

  if (checking) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!needs2FA) {
    return null;
  }

  return (
    <>
      {/* 2FA Setup Dialog */}
      <TwoFactorSetup
        open={showSetup}
        onOpenChange={setShowSetup}
        onComplete={handleSetupComplete}
      />

      {/* Enforcement Prompt Dialog */}
      <Dialog open={!showSetup && needs2FA} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="text-center text-xl">
              Secure Your Account
            </DialogTitle>
            <DialogDescription className="text-center">
              WeSave is a wallet-based platform. Two-factor authentication is required to protect your funds.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Smartphone className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Authenticator App Required</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You'll need an authenticator app like Google Authenticator, Authy, or Microsoft Authenticator.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-sm">Why is this important?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  2FA prevents unauthorized access even if someone obtains your password. All withdrawals and sensitive operations require 2FA verification.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button variant="hero" className="w-full" onClick={() => setShowSetup(true)}>
              <Shield className="h-4 w-4 mr-2" />
              Set Up 2FA Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
