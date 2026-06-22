import { Link } from "react-router-dom";
import { VestaraLogo } from "@/components/VestaraLogo";

export function LandingFooter() {
  return (
    <footer className="border-t border-border py-10">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <VestaraLogo className="h-8" />
            <p className="text-xs text-muted-foreground max-w-xs">
              Vestara is owned by <strong className="text-foreground">LLH Premium Enterprise</strong>. Technology supported by Flutterwave.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
            <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link to="/aml-policy" className="hover:text-primary transition-colors">AML Policy</Link>
            <Link to="/kyc-policy" className="hover:text-primary transition-colors">KYC Policy</Link>
            <a
              href="https://instagram.com/Vestara.ng"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              @Vestara.ng
            </a>
            <span>09039479954</span>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Vestara. All rights reserved. Platform fee applies on payouts.
        </div>
      </div>
    </footer>
  );
}
