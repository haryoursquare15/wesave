import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, Copy, Check, Eye, EyeOff, Smartphone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSecurity } from "@/hooks/useSecurity";
import { toast } from "sonner";

interface TwoFactorSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function TwoFactorSetup({ open, onOpenChange, onComplete }: TwoFactorSetupProps) {
  const { setup2FA, verify2FASetup, loading } = useSecurity();
  const [step, setStep] = useState<"intro" | "setup" | "verify" | "backup">("intro");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("intro");
      setSecret("");
      setOtpauthUrl("");
      setBackupCodes([]);
      setVerificationCode("");
    }
  }, [open]);

  const handleStartSetup = async () => {
    const result = await setup2FA();
    if (result.success && result.secret) {
      setSecret(result.secret);
      setOtpauthUrl(result.otpauth_url || "");
      setBackupCodes(result.backup_codes || []);
      setStep("setup");
    } else {
      const errorMsg = result.error || "Failed to start 2FA setup";
      // Show user-friendly error for common issues
      if (errorMsg.includes("key") || errorMsg.includes("Encryption") || errorMsg.includes("configuration")) {
        toast.error("Security configuration error. Please contact support.");
      } else {
        toast.error(errorMsg);
      }
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }

    const result = await verify2FASetup(verificationCode);
    if (result.success) {
      setStep("backup");
      toast.success("2FA enabled successfully!");
    } else {
      toast.error(result.error || "Invalid code. Please try again.");
    }
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success("Secret copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedBackup(true);
    toast.success("Backup codes copied!");
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  const handleComplete = () => {
    onOpenChange(false);
    onComplete?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            {step === "intro" && "Add an extra layer of security to your account"}
            {step === "setup" && "Scan the QR code with your authenticator app"}
            {step === "verify" && "Enter the code from your authenticator app"}
            {step === "backup" && "Save your backup codes in a safe place"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === "intro" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-start gap-3">
                  <Smartphone className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">What you'll need</p>
                    <p className="text-sm text-muted-foreground">
                      An authenticator app like Google Authenticator, Authy, or 1Password
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gold/10 rounded-lg border border-gold/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-gold mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Important</p>
                    <p className="text-sm text-muted-foreground">
                      2FA will be required for withdrawals, bank changes, and high-value transactions
                    </p>
                  </div>
                </div>
              </div>

              <Button onClick={handleStartSetup} disabled={loading} className="w-full">
                {loading ? "Setting up..." : "Get Started"}
              </Button>
            </motion.div>
          )}

          {step === "setup" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* QR Code placeholder - in production, generate actual QR */}
              <div className="bg-white p-4 rounded-lg flex items-center justify-center">
                <div className="w-48 h-48 bg-muted flex items-center justify-center rounded">
                  <div className="text-center p-4">
                    <p className="text-sm text-muted-foreground mb-2">Scan with authenticator app:</p>
                    <p className="text-xs font-mono break-all">{otpauthUrl.slice(0, 50)}...</p>
                  </div>
                </div>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                Can't scan? Enter the code manually:
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={showSecret ? secret : "••••••••••••••••••••"}
                    readOnly
                    className="font-mono text-sm pr-20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="p-1 hover:bg-muted rounded"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={handleCopySecret}
                      className="p-1 hover:bg-muted rounded"
                    >
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button onClick={() => setStep("verify")} className="w-full">
                I've Added It
              </Button>
            </motion.div>
          )}

          {step === "verify" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">Verification Code</label>
                <Input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-2xl font-mono tracking-widest"
                  maxLength={6}
                />
                <p className="text-xs text-muted-foreground text-center">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              <Button 
                onClick={handleVerify} 
                disabled={loading || verificationCode.length !== 6}
                className="w-full"
              >
                {loading ? "Verifying..." : "Verify & Enable"}
              </Button>

              <Button 
                variant="ghost" 
                onClick={() => setStep("setup")}
                className="w-full"
              >
                Go Back
              </Button>
            </motion.div>
          )}

          {step === "backup" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Save These Codes!</p>
                    <p className="text-sm text-muted-foreground">
                      If you lose access to your authenticator, you'll need these backup codes. Each code can only be used once.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, index) => (
                    <div key={index} className="font-mono text-sm p-2 bg-background rounded">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <Button 
                variant="outline" 
                onClick={handleCopyBackupCodes}
                className="w-full"
              >
                {copiedBackup ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy All Codes
              </Button>

              <Button onClick={handleComplete} className="w-full">
                I've Saved My Codes
              </Button>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
