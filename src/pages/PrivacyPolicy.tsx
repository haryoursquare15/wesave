import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-8">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">Privacy Policy</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl prose prose-sm dark:prose-invert">
        <h1 className="text-2xl font-bold text-foreground mb-6">WESAVE – PRIVACY POLICY</h1>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
            <p className="text-muted-foreground">
              We collect personal information such as name, phone number, email, bank details, and identification where required. We also collect transaction and technical data.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">2. How We Use Information</h2>
            <p className="text-muted-foreground">
              We use data to manage accounts, process contributions and payouts, verify identity, prevent fraud, and comply with legal obligations.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">3. Payment Processing</h2>
            <p className="text-muted-foreground">
              Wesave does not directly store card details. Payments are processed securely by licensed providers such as Flutterwave.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">4. Data Sharing</h2>
            <p className="text-muted-foreground">
              We may share information with payment processors, regulators, fraud prevention agencies, and hosting providers. We do not sell user data.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">5. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain data as long as accounts remain active and as required by financial regulations.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">6. Data Security</h2>
            <p className="text-muted-foreground">
              We implement encryption, access controls, and secure hosting practices. However, no system is 100% secure.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">7. Your Rights</h2>
            <p className="text-muted-foreground">
              Users may request access, correction, or deletion of their data subject to regulatory requirements.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">8. Cookies</h2>
            <p className="text-muted-foreground">
              We use cookies to improve experience and maintain sessions.
            </p>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-base font-semibold text-foreground">Contact Information</h3>
            <p className="text-muted-foreground">Email: contact@wesave.ng</p>
            <p className="text-muted-foreground">Phone: 09039479554</p>
            <p className="text-muted-foreground">Address: Lagos, Nigeria</p>
          </div>
        </section>
      </main>
    </div>
  );
}
