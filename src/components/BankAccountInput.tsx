import { useState, useEffect } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invokeSecureFunction } from "@/lib/secureApi";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { nigerianBanks } from "@/lib/nigerianBanks";
import { toast } from "sonner";

interface BankAccountInputProps {
  accountNumber: string;
  onAccountNumberChange: (value: string) => void;
  bankName: string;
  onBankNameChange: (value: string) => void;
  accountName: string;
  onAccountNameChange: (value: string) => void;
  onValidated: (valid: boolean) => void;
  disabled?: boolean;
}

export function BankAccountInput({
  accountNumber,
  onAccountNumberChange,
  bankName,
  onBankNameChange,
  accountName,
  onAccountNameChange,
  onValidated,
  disabled = false,
}: BankAccountInputProps) {
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const debouncedAccountNumber = useDebounce(accountNumber, 500);

  // Auto-validate when both bank and account number are ready
  useEffect(() => {
    const validate = async () => {
      if (!bankName || debouncedAccountNumber.length !== 10) {
        setValidated(false);
        onAccountNameChange("");
        onValidated(false);
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

        const result = response.data as { account_name: string; verified: boolean };
        if (result.verified && result.account_name) {
          onAccountNameChange(result.account_name);
          setValidated(true);
          onValidated(true);
          toast.success(`Account verified: ${result.account_name}`);
        } else {
          onAccountNameChange("");
          setValidated(false);
          onValidated(false);
          toast.error("Could not verify account. Check your details.");
        }
      } catch (err) {
        console.error("Bank validation error:", err);
        onAccountNameChange("");
        setValidated(false);
        onValidated(false);
        toast.error("Bank verification failed. Try again.");
      } finally {
        setValidating(false);
      }
    };

    validate();
  }, [bankName, debouncedAccountNumber]);

  // Reset validation when typing
  useEffect(() => {
    if (accountNumber !== debouncedAccountNumber) {
      setValidated(false);
      onValidated(false);
    }
  }, [accountNumber, debouncedAccountNumber]);

  return (
    <div className="space-y-3">
      <div>
        <Label>Account Number *</Label>
        <div className="relative">
          <Input
            placeholder="Enter 10-digit account number"
            maxLength={10}
            value={accountNumber}
            onChange={(e) => {
              onAccountNumberChange(e.target.value.replace(/\D/g, "").slice(0, 10));
              setValidated(false);
              onValidated(false);
            }}
            disabled={disabled}
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

      <div>
        <Label>Bank *</Label>
        <Select
          value={bankName}
          onValueChange={(v) => {
            onBankNameChange(v);
            setValidated(false);
            onValidated(false);
          }}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select bank" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {nigerianBanks.map((bank) => (
              <SelectItem key={bank} value={bank}>{bank}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {accountName && validated && (
        <div>
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
    </div>
  );
}
