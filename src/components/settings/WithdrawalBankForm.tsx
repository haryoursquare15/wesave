import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Check, AlertTriangle, Loader2, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeSecureFunction } from "@/lib/secureApi";
import { toast } from "sonner";
import { nigerianBanks } from "@/lib/nigerianBanks";
import { useDebounce } from "@/hooks/useDebounce";
import { getUserFriendlyError } from "@/lib/errorMessages";

interface WithdrawalBankFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface ValidationResult {
  account_name: string;
  verified: boolean;
}

type FormStep = "bank_details";

export function WithdrawalBankForm({ open, onOpenChange, onComplete }: WithdrawalBankFormProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<FormStep>("bank_details");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldownBlocked, setCooldownBlocked] = useState(false);
  const [cooldownHours, setCooldownHours] = useState<number | null>(null);

  const debouncedAccountNumber = useDebounce(accountNumber, 500);

  // Check 24-hour cooldown
  useEffect(() => {
    if (open && profile?.bank_details_changed_at) {
      const changedAt = new Date(profile.bank_details_changed_at).getTime();
      const hoursSince = (Date.now() - changedAt) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        setCooldownBlocked(true);
        setCooldownHours(Math.ceil(24 - hoursSince));
      } else {
        setCooldownBlocked(false);
        setCooldownHours(null);
      }
    } else {
      setCooldownBlocked(false);
      setCooldownHours(null);
    }
  }, [open, profile]);

  useEffect(() => {
    if (open && profile) {
      setBankName(profile.bank_name || "");
      setAccountNumber(profile.bank_account || "");
      setAccountName("");
      setValidated(false);
      setStep("bank_details");
    }
  }, [open, profile]);

  // Auto-validate bank account
  useEffect(() => {
    const validateAccount = async () => {
      if (!bankName || debouncedAccountNumber.length !== 10) {
        setValidated(false);
        setAccountName("");
        return;
      }

      setValidating(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await invokeSecureFunction({
          action: "validate_bank_account",
          bank_name: bankName,
          account_number: debouncedAccountNumber,
        });

        if (response.error) throw new Error(response.error.message);

        const result = response.data as ValidationResult;
        if (result.verified && result.account_name) {
          setAccountName(result.account_name);
          setValidated(true);
          toast.success(`Account verified: ${result.account_name}`);
        } else {
          setValidated(false);
          setAccountName("");
          toast.error("Could not verify account. Please check your details.");
        }
      } catch (err) {
        console.error("Bank validation error:", err);
        setValidated(false);
        setAccountName("");
        toast.error(getUserFriendlyError(err));
      } finally {
        setValidating(false);
      }
    };

    validateAccount();
  }, [bankName, debouncedAccountNumber]);

  useEffect(() => {
    if (accountNumber !== debouncedAccountNumber) {
      setValidated(false);
    }
  }, [accountNumber, debouncedAccountNumber]);

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }

    if (!bankName || !accountNumber || accountNumber.length !== 10 || !validated) {
      toast.error("Please complete bank verification first");
      return;
    }

    setLoading(true);
    try {
      // Update bank details
      const { error } = await supabase
        .from("profiles")
        .update({
          bank_name: bankName,
          bank_account: accountNumber,
          bank_details_changed_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success("Bank details updated successfully. Withdrawals are restricted for 24 hours.");
      onOpenChange(false);
      onComplete?.();
    } catch (err) {
      console.error("Error updating bank details:", err);
      toast.error(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Withdrawal Bank Account
          </DialogTitle>
          <DialogDescription>
            Set the bank account for receiving payouts
          </DialogDescription>
        </DialogHeader>

        {cooldownBlocked ? (
          <div className="p-6 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
              <Clock className="h-8 w-8 text-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Cooldown Active</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Bank details were recently changed. You can update again in{" "}
                <span className="font-medium text-warning">{cooldownHours} hours</span>.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="p-4 bg-gold/10 rounded-lg border border-gold/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-gold mt-0.5" />
                <div>
                  <p className="font-medium text-foreground text-sm">Important</p>
                  <p className="text-xs text-muted-foreground">
                    A verification code will be sent to your email. Changing bank details triggers a 24-hour withdrawal cooldown.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select Bank</Label>
              <Select value={bankName} onValueChange={(value) => {
                setBankName(value);
                setValidated(false);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose your bank" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {nigerianBanks.map((bank) => (
                    <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <div className="relative">
                <Input
                  id="accountNumber"
                  type="text"
                  placeholder="Enter 10-digit account number"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => {
                    setAccountNumber(e.target.value.replace(/\D/g, ""));
                    setValidated(false);
                  }}
                  className={validated ? "pr-10 border-success" : ""}
                />
                {validating && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {validated && !validating && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
                )}
              </div>
            </div>

            {accountName && (
              <div className="space-y-2">
                <Label>Account Name (Verified)</Label>
                <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                  <p className="text-sm font-medium text-foreground">{accountName}</p>
                </div>
              </div>
            )}

            {!accountName && bankName && accountNumber.length === 10 && !validating && !validated && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-xs text-destructive">
                  Unable to verify account. Please check bank and account number.
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || !bankName || accountNumber.length !== 10 || !validated || validating}
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Save Bank
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}
