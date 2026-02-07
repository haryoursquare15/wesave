import { useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSecurity } from "@/hooks/useSecurity";
import { toast } from "sonner";

interface TwoFactorVerifyProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose: string;
  onVerified: (token: string) => void;
  onCancel?: () => void;
}

export function TwoFactorVerify({ 
  open, 
  onOpenChange, 
  purpose, 
  onVerified,
  onCancel 
}: TwoFactorVerifyProps) {
  const { verify2FA, loading } = useSecurity();
  const [code, setCode] = useState("");

  const handleVerify = async () => {
    if (code.length < 6) {
      toast.error("Please enter a valid code");
      return;
    }

    const result = await verify2FA(code, purpose);
    if (result.verified) {
      toast.success("Verified successfully");
      onOpenChange(false);
      onVerified(code);
    } else {
      toast.error(result.error || "Invalid code. Please try again.");
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    onCancel?.();
  };

  const getPurposeText = (purpose: string) => {
    switch (purpose) {
      case "withdrawal":
        return "Verify your identity to proceed with this withdrawal";
      case "bank_change":
        return "Verify your identity to change your bank details";
      case "high_value":
        return "This is a high-value transaction. Please verify your identity.";
      default:
        return "Please verify your identity to continue";
    }
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
            {getPurposeText(purpose)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Verification Code</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Enter 6-digit code or backup code"
              className="text-center text-xl font-mono tracking-widest"
              maxLength={8}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.length >= 6) {
                  handleVerify();
                }
              }}
            />
            <p className="text-xs text-muted-foreground text-center">
              Enter the code from your authenticator app or a backup code
            </p>
          </div>

          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleVerify} 
              disabled={loading || code.length < 6}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
