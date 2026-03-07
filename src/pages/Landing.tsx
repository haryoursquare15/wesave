import { useCallback } from "react";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingStats } from "@/components/landing/LandingStats";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingDemo } from "@/components/landing/LandingDemo";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function Landing() {
  const handleDownloadHTML = useCallback(() => {
    // Gather all stylesheets
    const styles: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          styles.push(rule.cssText);
        }
      } catch {
        // Cross-origin stylesheets – fetch via link tag
        if (sheet.href) {
          styles.push(`@import url("${sheet.href}");`);
        }
      }
    }

    const landingEl = document.getElementById("landing-root");
    if (!landingEl) return;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WeSave — Modern Ajo & Esusu Savings Platform</title>
  <meta name="description" content="Join WeSave, Africa's trusted rotating savings platform. Create thrift groups, automate contributions, build credit, and receive payouts securely." />
  <style>${styles.join("\n")}</style>
</head>
<body>
  ${landingEl.outerHTML}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wesave-landing-page.html";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div id="landing-root" className="min-h-screen bg-background">
      <LandingHero />
      <LandingStats />
      <LandingFeatures />
      <LandingHowItWorks />
      <LandingDemo />
      <LandingTestimonials />
      <LandingFAQ />
      <LandingCTA />
      <LandingFooter />
      <div className="fixed bottom-6 right-6 z-50">
        <Button onClick={handleDownloadHTML} variant="default" size="sm" className="shadow-lg gap-2">
          <Download className="h-4 w-4" />
          Download HTML
        </Button>
      </div>
    </div>
  );
}
