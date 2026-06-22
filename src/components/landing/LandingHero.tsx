import { motion } from "framer-motion";
import { ArrowRight, Star, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { VestaraLogo } from "@/components/VestaraLogo";

const benefits = [
  "Automated contributions & payouts",
  "Real-time group chat & notifications",
  "Transparent transaction history",
  "Member verification with BVN",
];

export function LandingHero() {
  return (
    <header className="relative overflow-hidden bg-hero-pattern">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-gold/5" />

      <div className="relative container mx-auto px-4 py-6">
        {/* Nav */}
        <nav className="flex items-center justify-between mb-16">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <VestaraLogo className="h-12" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </motion.div>
        </nav>

        {/* Hero Content */}
        <div className="max-w-4xl mx-auto text-center pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6"
          >
            <Star className="h-4 w-4 fill-gold text-gold" />
            Trusted by 10,000+ users across Africa
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight"
          >
            Save Together,{" "}
            <span className="gradient-text">Grow Together</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto"
          >
            Join the modern Ajo/Esusu platform. Create rotating savings groups,
            build credit, and achieve your financial goals with trusted members.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link to="/auth?mode=signup">
              <Button variant="hero" size="xl" className="w-full sm:w-auto">
                Start Saving Now
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="outline" size="xl" className="w-full sm:w-auto">
                Explore Groups
              </Button>
            </Link>
          </motion.div>

          {/* Trust Indicators */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground"
          >
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" />
                {benefit}
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </header>
  );
}
