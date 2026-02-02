import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Building2, CreditCard, User, Check, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const banks = [
  "Access Bank",
  "First Bank",
  "GTBank",
  "UBA",
  "Zenith Bank",
  "Sterling Bank",
  "Fidelity Bank",
  "FCMB",
  "Wema Bank",
  "Union Bank",
];

const steps = [
  { id: 1, title: "Verify Identity", icon: Shield },
  { id: 2, title: "Bank Details", icon: Building2 },
  { id: 3, title: "Link Card", icon: CreditCard },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    bvn: "",
    bankName: "",
    accountNumber: "",
    accountName: "",
  });

  const handleNext = async () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsLoading(true);
      // Simulate API call
      setTimeout(() => {
        setIsLoading(false);
        navigate("/dashboard");
      }, 2000);
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
                  onValueChange={(value) =>
                    setFormData({ ...formData, bankName: value })
                  }
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Choose your bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((bank) => (
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
                  className="h-12"
                  value={formData.accountNumber}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      accountNumber: e.target.value.replace(/\D/g, ""),
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountName">Account Name</Label>
                <Input
                  id="accountName"
                  type="text"
                  placeholder="Account holder name"
                  className="h-12"
                  value={formData.accountName}
                  onChange={(e) =>
                    setFormData({ ...formData, accountName: e.target.value })
                  }
                />
              </div>
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
                <CreditCard className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Link Debit Card
              </h2>
              <p className="text-muted-foreground">
                Link a card for auto-debit contributions (you can skip for now)
              </p>
            </div>

            <div className="p-6 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">
                Add Debit Card
              </p>
              <p className="text-xs text-muted-foreground">
                Powered by Flutterwave - Secure & Fast
              </p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4">
              <h4 className="font-medium text-sm text-foreground mb-2">
                Why link a card?
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-success mt-0.5" />
                  <span>Auto-debit for seamless contributions</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-success mt-0.5" />
                  <span>Never miss a payment deadline</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-success mt-0.5" />
                  <span>Build better credit scores faster</span>
                </li>
              </ul>
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
              Step {currentStep} of 3
            </span>
            <button
              onClick={() => navigate("/dashboard")}
              className="text-sm text-primary hover:underline"
            >
              Skip for now
            </button>
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
                    className={`w-12 h-1 mx-2 rounded-full transition-colors ${
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
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : currentStep === 3 ? (
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
