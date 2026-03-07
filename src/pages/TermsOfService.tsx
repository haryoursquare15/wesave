import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-8">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">Terms of Service</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl prose prose-sm dark:prose-invert">
        <h1 className="text-2xl font-bold text-foreground mb-2">WESAVE – TERMS OF SERVICE</h1>
        <p className="text-muted-foreground mb-6">Platform Name: Wesave | Owned By: LLH Premium Enterprise</p>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">1. Introduction</h2>
            <p className="text-muted-foreground">
              Wesave is a technology platform owned and operated by LLH Premium Enterprise that enables users to create, join, and manage digital thrift contribution groups with automated collection and payout functionality. By using Wesave, you agree to these Terms.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">2. Nature of Service</h2>
            <p className="text-muted-foreground">
              Wesave is a technology platform and thrift coordination system. Wesave is not a bank, microfinance institution, investment platform, or deposit-taking financial institution. All payment processing is handled by licensed third-party providers including Flutterwave.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">3. Eligibility</h2>
            <p className="text-muted-foreground">
              Users must be at least 18 years old and provide accurate information. Wesave reserves the right to suspend accounts with false information.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">4. Account Registration</h2>
            <p className="text-muted-foreground">
              Users are responsible for maintaining account confidentiality and all activity under their account.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">5. How Wesave Works</h2>
            <p className="text-muted-foreground">
              Wesave enables thrift group creation, automated contributions, payout rotation, and transparent ledger tracking. Ledger entries are generated based on verified payment confirmations received from payment processor webhooks.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">6. Fees</h2>
            <p className="text-muted-foreground">
              Wesave may charge platform and transaction fees, which will be disclosed before transactions are completed.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">7. User Responsibilities</h2>
            <p className="text-muted-foreground">
              Users must not engage in fraud, money laundering, or illegal activities. Wesave may suspend suspicious accounts.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">8. Risk Disclosure</h2>
            <p className="text-muted-foreground">
              Users acknowledge that thrift groups depend on member compliance. Wesave is not liable for losses caused by member default, processor downtime, or regulatory changes.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">9. Suspension & Termination</h2>
            <p className="text-muted-foreground">
              Wesave may suspend or terminate accounts for violations or legal requirements.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">10. Intellectual Property</h2>
            <p className="text-muted-foreground">
              All content and software belong to LLH Premium Enterprise and may not be reused without permission.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">11. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              Wesave's liability shall not exceed fees paid by the user in the preceding 3 months.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">12. Governing Law</h2>
            <p className="text-muted-foreground">
              These Terms are governed by the laws of the Federal Republic of Nigeria.
            </p>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-base font-semibold text-foreground">Contact Information</h3>
            <p className="text-muted-foreground">Email: llhpremium@gmail.com</p>
            <p className="text-muted-foreground">Phone: 09039479554</p>
            <p className="text-muted-foreground">Address: Lagos, Nigeria</p>
          </div>
        </section>
      </main>
    </div>
  );
}
