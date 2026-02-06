import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { nigerianBanks } from "@/lib/nigerianBanks";

interface WithdrawalBankFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function WithdrawalBankForm({ open, onOpenChange, onComplete }: WithdrawalBankFormProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && profile) {
      setBankName(profile.bank_name || "");
      setAccountNumber(profile.bank_account || "");
      setAccountName("");
    }
  }, [open, profile]);

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
            <Select value={bankName} onValueChange={setBankName}>
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
            <Input
              id="accountNumber"
              type="text"
              placeholder="Enter 10-digit account number"
              maxLength={10}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountName">Account Name (Optional)</Label>
            <Input
              id="accountName"
              type="text"
              placeholder="Account holder name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              For your reference only. We'll verify the account with your bank.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !bankName || accountNumber.length !== 10}
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
