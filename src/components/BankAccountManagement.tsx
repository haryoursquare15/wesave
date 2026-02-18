import { useState, useEffect } from "react";
import { Building2, Shield, Clock, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { WithdrawalBankForm } from "@/components/settings/WithdrawalBankForm";

export function BankAccountManagement() {
  const { profile } = useAuth();
  const [showBankForm, setShowBankForm] = useState(false);

  const hasBankDetails = profile?.bank_name && profile?.bank_account;

  const getCooldownHoursLeft = (): number | null => {
    if (!profile?.bank_details_changed_at) return null;
    const changedAt = new Date(profile.bank_details_changed_at).getTime();
    const hoursSince = (Date.now() - changedAt) / (1000 * 60 * 60);
    if (hoursSince >= 24) return null;
    return Math.ceil(24 - hoursSince);
  };

  const cooldownHours = getCooldownHoursLeft();

  const getMaskedAccount = () => {
    if (!profile?.bank_account) return null;
    const acc = profile.bank_account;
    if (acc.length <= 4) return acc;
    return "••••••" + acc.slice(-4);
  };

  if (!hasBankDetails) {
    return (
      <>
        <Card className="bg-card border border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">No Bank Account</h3>
                <p className="text-xs text-muted-foreground">
                  Add a bank account for withdrawals
                </p>
              </div>
              <Button size="sm" onClick={() => setShowBankForm(true)}>
                Add Bank
              </Button>
            </div>
          </CardContent>
        </Card>
        <WithdrawalBankForm
          open={showBankForm}
          onOpenChange={setShowBankForm}
        />
      </>
    );
  }

  return (
    <>
      <Card className="bg-card border border-border overflow-hidden">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Bank Account</h3>
                <p className="text-xs text-muted-foreground">Used for withdrawal payouts</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              Verified
            </Badge>
          </div>

          {/* Bank Details Card */}
          <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl p-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Bank Name</p>
                <p className="text-sm font-medium text-foreground">{profile.bank_name}</p>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Account Number</p>
                  <p className="text-lg tracking-widest text-foreground font-mono font-medium">
                    {getMaskedAccount()}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-success">
                  <Shield className="h-3 w-3" />
                  <span className="text-xs">Secured</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cooldown Warning */}
          {cooldownHours !== null && (
            <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <Clock className="h-4 w-4 text-warning flex-shrink-0" />
              <p className="text-xs text-warning">
                Withdrawals restricted for {cooldownHours}h after bank change
              </p>
            </div>
          )}

          {/* Change Bank Button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowBankForm(true)}
            disabled={cooldownHours !== null}
          >
            <Pencil className="h-4 w-4 mr-2" />
            {cooldownHours !== null
              ? `Change Bank (available in ${cooldownHours}h)`
              : "Change Bank Account"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Email verification required. Bank changes trigger a 24-hour withdrawal cooldown.
          </p>
        </CardContent>
      </Card>

      <WithdrawalBankForm
        open={showBankForm}
        onOpenChange={setShowBankForm}
      />
    </>
  );
}
