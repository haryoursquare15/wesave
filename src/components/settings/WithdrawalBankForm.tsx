import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Check, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { nigerianBanks } from "@/lib/nigerianBanks";
import { useDebounce } from "@/hooks/useDebounce";

interface WithdrawalBankFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface ValidationResult {
  account_name: string;
  verified: boolean;
}

export function WithdrawalBankForm({ open, onOpenChange, onComplete }: WithdrawalBankFormProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [loading, setLoading] = useState(false);

  const debouncedAccountNumber = useDebounce(accountNumber, 500);

  useEffect(() => {
    if (open && profile) {
      setBankName(profile.bank_name || "");
      setAccountNumber(profile.bank_account || "");
      setAccountName("");
      setValidated(false);
    }
  }, [open, profile]);

  // Auto-validate bank account when both fields are filled
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

        const response = await supabase.functions.invoke("flutterwave-payments", {
          body: {
            action: "validate_bank_account",
            bank_name: bankName,
            account_number: debouncedAccountNumber,
          },
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        const result = response.data as ValidationResult;
        if (result.verified && result.account_name) {
          setAccountName(result.account_name);
          setValidated(true);
          toast.success(`Account verified: ${result.account_name}`);
        } else {
          setValidated(false);
          setAccountName("");
          toast.error("Could not verify account. Please check details.");
        }
      } catch (err) {
        console.error("Bank validation error:", err);
        setValidated(false);
        setAccountName("");
        const message = err instanceof Error ? err.message : "Failed to validate account";
        toast.error(message);
      } finally {
        setValidating(false);
      }
    };

    validateAccount();
  }, [bankName, debouncedAccountNumber]);

  // Reset validation when inputs change
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

    if (!bankName || !accountNumber) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (accountNumber.length !== 10) {
      toast.error("Account number must be 10 digits");
      return;
    }

    if (!validated) {
      toast.error("Please wait for account verification to complete");
      return;
    }

    setLoading(true);

    try {
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
      toast.success("Bank details updated successfully");
      onOpenChange(false);
      onComplete?.();
    } catch (err) {
      console.error("Error updating bank details:", err);
      toast.error("Failed to update bank details");
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
                  Changing your bank details will trigger a 24-hour cooldown before you can make withdrawals.
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
                  <SelectItem key={bank} value={bank}>
                    {bank}
                  </SelectItem>
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
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
