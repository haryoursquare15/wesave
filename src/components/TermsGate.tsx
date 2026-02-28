import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TermsGateProps {
  groupId: string;
  groupName: string;
  contributionAmount: number;
  period: string;
  onComplete: () => void;
}

export function TermsGate({
  groupId,
  groupName,
  contributionAmount,
  period,
  onComplete,
}: TermsGateProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAcceptTerms = async () => {
    setLoading(true);
    try {
      // Mark membership as terms-accepted / tokenization complete
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("group_memberships")
        .update({
          tokenization_completed: true,
          terms_accepted_at: new Date().toISOString(),
        })
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .eq("status", "active");

      if (error) throw error;

      toast.success("Terms accepted — welcome to the group!");
      setTimeout(() => onComplete(), 800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to accept terms");
    } finally {
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
        <Card>
          <CardHeader className="text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <FileText className="h-7 w-7 text-primary" />
            </div>
            <CardTitle>Terms & Conditions</CardTitle>
            <CardDescription>
              Please review and accept the terms before participating in{" "}
              <span className="font-semibold text-foreground">{groupName}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 space-y-3 text-sm max-h-64 overflow-y-auto">
              <p className="font-medium">By participating in this thrift group, you agree to:</p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>
                  Contribute{" "}
                  <span className="font-medium text-foreground">
                    ₦{contributionAmount.toLocaleString()}
                  </span>{" "}
                  {period} as scheduled
                </li>
                <li>
                  Ensure your wallet is funded before each contribution deadline
                </li>
                <li>
                  A platform fee applies to each payout:{" "}
                  <span className="font-medium text-foreground">₦100</span> flat for payouts under
                  ₦20,000, or{" "}
                  <span className="font-medium text-foreground">1%</span> (capped at ₦500) for
                  payouts of ₦20,000 and above
                </li>
                <li>
                  Failure to contribute may result in credit score penalties and removal from the
                  group
                </li>
                <li>Payout order is randomized and binding once the thrift commences</li>
                <li>The group admin manages disputes and schedule changes</li>
                <li>You may exit the group only after all cycles are completed</li>
                <li>You may be a member of up to 2 active groups at a time</li>
              </ul>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms-gate"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              />
              <label htmlFor="terms-gate" className="text-sm leading-snug cursor-pointer">
                I have read and accept the terms and conditions for this thrift group
              </label>
            </div>

            <Button
              variant="hero"
              className="w-full"
              disabled={!termsAccepted || loading}
              onClick={handleAcceptTerms}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Activating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Accept & Join Group
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
