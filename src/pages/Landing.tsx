import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingStats } from "@/components/landing/LandingStats";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingDemo } from "@/components/landing/LandingDemo";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect vestara.ng visitors straight to the VFD sandbox
    if (typeof window !== "undefined") {
      const host = window.location.hostname.toLowerCase();
      if (host === "vestara.ng" || host === "www.vestara.ng") {
        navigate("/vfd-sandbox", { replace: true });
      }
    }
  }, [navigate]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background">
      <LandingHero />
      <LandingStats />
      <LandingFeatures />
      <LandingHowItWorks />
      <LandingDemo />
      <LandingTestimonials />
      <LandingFAQ />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
