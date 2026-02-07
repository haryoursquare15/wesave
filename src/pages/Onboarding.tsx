import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Building2, CreditCard, User, Check, Shield, AtSign, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useJoinGroupViaInvite } from "@/hooks/useGroupInvites";
import { toast } from "sonner";
import { nigerianBanks } from "@/lib/nigerianBanks";
import { useDebounce } from "@/hooks/useDebounce";

const steps = [
  { id: 1, title: "Personal Info", icon: User },
  { id: 2, title: "Create Username", icon: AtSign },
  { id: 3, title: "Verify Identity", icon: Shield },
  { id: 4, title: "Bank Details", icon: Building2 },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { joinGroup } = useJoinGroupViaInvite();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [bankValidating, setBankValidating] = useState(false);
  const [bankValidated, setBankValidated] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    bvn: "",
    bankName: "",
    accountNumber: "",
    accountName: "",
  });

  // Debounce account number for validation
  const debouncedAccountNumber = useDebounce(formData.accountNumber, 800);

  // Check for pending invite token
  const pendingInviteToken = sessionStorage.getItem("pending_invite_token");

  // Redirect if already completed onboarding
  useEffect(() => {
    const checkOnboarding = async () => {
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("onboarding_completed, full_name")
          .eq("id", user.id)
          .single();
        
        if (data?.onboarding_completed) {
          navigate("/dashboard");
        } else if (data?.full_name) {
          setFormData(prev => ({ ...prev, fullName: data.full_name || "" }));
        }
      }
    };
    checkOnboarding();
  }, [user, navigate]);

  // Auto-validate bank account when bank name and account number are complete
  const validateBankAccount = useCallback(async () => {
    if (!formData.bankName || debouncedAccountNumber.length !== 10) {
      setBankValidated(false);
      setBankError(null);
      setFormData(prev => ({ ...prev, accountName: "" }));
      return;
    }

    setBankValidating(true);
    setBankError(null);
    setBankValidated(false);

    try {
      const { data, error } = await supabase.functions.invoke("wallet-operations", {
        body: {
          action: "validate_bank_account",
          bank_name: formData.bankName,
          account_number: debouncedAccountNumber,
        },
      });

      if (error) throw error;

      if (data?.success && data?.verified) {
        setFormData(prev => ({ ...prev, accountName: data.account_name || "" }));
        setBankValidated(true);
        setBankError(null);
      } else {
        setBankError(data?.error || "Unable to verify account");
        setFormData(prev => ({ ...prev, accountName: "" }));
      }
    } catch (err) {
      console.error("Bank validation error:", err);
      setBankError("Failed to validate account. Please check your details.");
      setFormData(prev => ({ ...prev, accountName: "" }));
    } finally {
      setBankValidating(false);
    }
  }, [formData.bankName, debouncedAccountNumber]);

  useEffect(() => {
    if (currentStep === 4) {
      validateBankAccount();
    }
  }, [currentStep, validateBankAccount]);

  const validateFullName = (name: string) => {
    if (!name || name.trim().length < 3) {
      setFullNameError("Full legal name is required (minimum 3 characters)");
      return false;
    }
    if (!/^[a-zA-Z\s'-]+$/.test(name.trim())) {
      setFullNameError("Name can only contain letters, spaces, hyphens, and apostrophes");
      return false;
    }
    setFullNameError(null);
    return true;
  };

  const validateUsername = async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return false;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameError("Username can only contain letters, numbers, and underscores");
      return false;
    }

    // Check if username is taken
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username.toLowerCase())
      .neq("id", user?.id || "")
      .maybeSingle();

    if (data) {
      setUsernameError("This username is already taken");
      return false;
    }

    setUsernameError(null);
    return true;
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!validateFullName(formData.fullName)) return;
    }

    if (currentStep === 2) {
      const isValid = await validateUsername(formData.username);
      if (!isValid) return;
    }

    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      await handleComplete();
    }
  };

  const handleComplete = async () => {
    if (!user) {
      toast.error("Please sign in first");
      navigate("/auth");
      return;
    }

    setIsLoading(true);

    try {
      // Update profile with onboarding data
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: formData.fullName.trim(),
          username: formData.username.toLowerCase(),
          bvn: formData.bvn || null,
          bank_name: formData.bankName || null,
          bank_account: formData.accountNumber || null,
          onboarding_completed: true,
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Refresh profile data in context
      await refreshProfile();

      // Check for pending invite and join group
      if (pendingInviteToken) {
        try {
          const result = await joinGroup(pendingInviteToken);
          sessionStorage.removeItem("pending_invite_token");
          toast.success("You've joined the group!");
        } catch (err) {
          console.error("Failed to join group via invite:", err);
          // Still continue to dashboard even if join fails
        }
      }

      toast.success("Profile setup complete!");
      navigate("/dashboard");
    } catch (error) {
      console.error("Onboarding error:", error);
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center mb-8">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <User className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Your Legal Name
              </h2>
              <p className="text-muted-foreground">
                Enter your full legal name as it appears on your ID
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Legal Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                className="h-12"
                value={formData.fullName}
                onChange={(e) => {
                  setFormData({ ...formData, fullName: e.target.value });
                  setFullNameError(null);
                }}
              />
              {fullNameError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {fullNameError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                This name will be used for KYC verification and payouts.
              </p>
            </div>

            {pendingInviteToken && (
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                <p className="text-sm text-primary font-medium">
                  You have a pending group invitation!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete your profile to join the group automatically.
                </p>
              </div>
            )}
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center mb-8">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <AtSign className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Choose Your Username
              </h2>
              <p className="text-muted-foreground">
                Pick a unique username so others can find and invite you to groups
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  id="username"
                  type="text"
                  placeholder="yourname"
                  className="h-12 pl-8"
                  value={formData.username}
                  onChange={(e) => {
                    setFormData({ ...formData, username: e.target.value.replace(/\s/g, "") });
                    setUsernameError(null);
                  }}
                />
              </div>
              {usernameError && (
                <p className="text-xs text-destructive">{usernameError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Only letters, numbers, and underscores. Minimum 3 characters.
              </p>
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center mb-8">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Verify Your Identity
              </h2>
              <p className="text-muted-foreground">
                We need your BVN to verify your identity and ensure platform security
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bvn">Bank Verification Number (BVN)</Label>
              <Input
                id="bvn"
                type="text"
                placeholder="Enter your 11-digit BVN"
                maxLength={11}
                className="h-12 text-center text-lg tracking-widest"
                value={formData.bvn}
                onChange={(e) =>
                  setFormData({ ...formData, bvn: e.target.value.replace(/\D/g, "") })
                }
              />
              <p className="text-xs text-muted-foreground">
                Your BVN is encrypted and securely stored. We never share your data.
              </p>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div
            key="step4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center mb-8">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Bank Account Details
              </h2>
              <p className="text-muted-foreground">
                Add your bank account for receiving payouts from your thrift groups
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Bank</Label>
                <Select
                  value={formData.bankName}
                  onValueChange={(value) => {
                    setFormData({ ...formData, bankName: value, accountName: "" });
                    setBankValidated(false);
                    setBankError(null);
                  }}
                >
                  <SelectTrigger className="h-12">
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
                    className={`h-12 pr-10 ${bankValidated ? 'border-success' : bankError ? 'border-destructive' : ''}`}
                    value={formData.accountNumber}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        accountNumber: e.target.value.replace(/\D/g, ""),
                        accountName: "",
                      });
                      setBankValidated(false);
                      setBankError(null);
                    }}
                  />
                  {bankValidating && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-primary" />
                  )}
                  {bankValidated && !bankValidating && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-success" />
                  )}
                </div>
                {bankError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {bankError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountName">Account Name</Label>
                <Input
                  id="accountName"
                  type="text"
                  placeholder={bankValidating ? "Verifying..." : bankValidated ? formData.accountName : "Auto-filled after verification"}
                  className={`h-12 ${bankValidated ? 'bg-muted' : ''}`}
                  value={formData.accountName}
                  readOnly
                  disabled
                />
                {bankValidated && formData.accountName && (
                  <p className="text-xs text-success flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Account verified successfully
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress Header */}
      <header className="border-b border-border py-4">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">
              Step {currentStep} of {steps.length}
            </span>
            <span className="text-sm font-medium text-primary">
              Required
            </span>
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
                    currentStep > step.id
                      ? "bg-success text-success-foreground"
                      : currentStep === step.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {currentStep > step.id ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <step.icon className="h-5 w-5" />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-8 h-1 mx-1 rounded-full transition-colors ${
                      currentStep > step.id ? "bg-success" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-md">
        <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
      </main>

      {/* Footer Actions */}
      <footer className="border-t border-border p-4">
        <div className="container mx-auto max-w-md flex gap-3">
          {currentStep > 1 && (
            <Button variant="outline" onClick={handleBack} className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <Button
            variant="hero"
            onClick={handleNext}
            className="flex-1"
            disabled={
              isLoading || 
              bankValidating ||
              (currentStep === 1 && !formData.fullName) || 
              (currentStep === 2 && !formData.username) ||
              (currentStep === 4 && formData.bankName && formData.accountNumber.length === 10 && !bankValidated)
            }
          >
            {isLoading ? (
              <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : currentStep === steps.length ? (
              <>
                Complete Setup
                <Check className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}
