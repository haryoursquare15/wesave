import { useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, Shield, CheckCircle, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// FlutterwaveCheckout type declared in RecurringTestDashboard.tsx

interface TokenizationGateProps {
  groupId: string;
  groupName: string;
  contributionAmount: number;
  period: string;
  onComplete: () => void;
}

export function TokenizationGate({
  groupId,
  groupName,
  contributionAmount,
  period,
  onComplete,
}: TokenizationGateProps) {
  const [step, setStep] = useState<"terms" | "tokenize" | "verifying">("terms");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadFlutterwaveScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.FlutterwaveCheckout) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.flutterwave.com/v3.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load payment script"));
      document.head.appendChild(script);
    });
  };

  const handleAcceptTerms = () => {
    setStep("tokenize");
  };

  const handleTokenize = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("card-tokenization", {
        body: { action: "initiate", groupId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to initiate tokenization");

      // If user already has a valid token
      if (data.already_tokenized) {
        toast.success("Existing card found — group activated!");
        onComplete();
        return;
      }

      // Load Flutterwave checkout
      await loadFlutterwaveScript();

      const config = data.payment_config;

      window.FlutterwaveCheckout?.({
        ...config,
        callback: async (response: { transaction_id?: string; tx_ref?: string; status?: string }) => {
          if (response.status === "successful" || response.status === "completed") {
            setStep("verifying");
            try {
              const { data: verifyData, error: verifyError } = await supabase.functions.invoke("card-tokenization", {
                body: {
                  action: "verify",
                  transactionId: response.transaction_id,
                  groupId,
                  txRef: response.tx_ref,
                },
              });

              if (verifyError) throw verifyError;
              if (!verifyData?.success) throw new Error(verifyData?.error || "Verification failed");

              toast.success(
                `Card authorized! ₦${verifyData.amount_credited?.toLocaleString() || contributionAmount.toLocaleString()} credited to your wallet.`
              );
              onComplete();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Verification failed");
              setStep("tokenize");
            }
          } else {
            toast.error("Payment was not successful. Please try again.");
          }
          setLoading(false);
        },
        onclose: () => {
          setLoading(false);
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start card authorization");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {step === "terms" && (
          <Card>
            <CardHeader className="text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <CardTitle>Terms & Conditions</CardTitle>
              <CardDescription>
                Please review and accept the terms before joining <span className="font-semibold text-foreground">{groupName}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-3 text-sm max-h-64 overflow-y-auto">
                <p className="font-medium">By participating in this thrift group, you agree to:</p>
                <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                  <li>
                    Contribute <span className="font-medium text-foreground">₦{contributionAmount.toLocaleString()}</span> {period} as scheduled
                  </li>
                  <li>Authorize recurring card charges when your wallet balance is insufficient</li>
                  <li>A 2% platform service fee is deducted from each payout</li>
                  <li>Failure to contribute may result in credit score penalties and removal from the group</li>
                  <li>Payout order is randomized and binding once the thrift commences</li>
                  <li>The group admin manages disputes and schedule changes</li>
                  <li>You may exit the group only after all cycles are completed</li>
                  <li>Card authorization is required for auto-debit groups to ensure timely contributions</li>
                </ul>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="tokenize-terms"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                />
                <label
                  htmlFor="tokenize-terms"
                  className="text-sm leading-snug cursor-pointer"
                >
                  I have read and accept the terms and conditions for this thrift group
                </label>
              </div>

              <Button
                variant="hero"
                className="w-full"
                disabled={!termsAccepted}
                onClick={handleAcceptTerms}
              >
                Continue to Card Authorization
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "tokenize" && (
          <Card>
            <CardHeader className="text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <CreditCard className="h-7 w-7 text-primary" />
              </div>
              <CardTitle>Authorize Card</CardTitle>
              <CardDescription>
                A one-time charge of <span className="font-semibold text-foreground">₦{contributionAmount.toLocaleString()}</span> will
                be made to authorize your card. This amount will be <span className="font-semibold text-foreground">credited to your wallet</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-primary" />
                  <span>Your card details are secured by Flutterwave</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span>Amount charged is deposited into your WeSave wallet</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span>Future contributions debit wallet first, then card if needed</span>
                </div>
              </div>

              <Button
                variant="hero"
                className="w-full"
                onClick={handleTokenize}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Authorize Card — ₦{contributionAmount.toLocaleString()}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "verifying" && (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Verifying Payment</h3>
              <p className="text-muted-foreground text-sm">
                Please wait while we verify your card authorization...
              </p>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
