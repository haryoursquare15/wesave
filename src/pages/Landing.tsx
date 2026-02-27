import { LandingHero } from "@/components/landing/LandingHero";
import { LandingStats } from "@/components/landing/LandingStats";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function Landing() {

  return (
    <div className="min-h-screen bg-background">
      <LandingHero />
      <LandingStats />
      <LandingFeatures />
      <LandingHowItWorks />
      <LandingTestimonials />
      <LandingFAQ />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
