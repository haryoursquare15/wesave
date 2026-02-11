import { motion } from "framer-motion";
import { ArrowRight, Shield, Users, Wallet, TrendingUp, Star, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { WeSaveLogo } from "@/components/WeSaveLogo";

const features = [
  {
    icon: Users,
    title: "Thrift Groups",
    description: "Create or join rotating savings groups with trusted members",
  },
  {
    icon: Wallet,
    title: "Digital Wallet",
    description: "Secure wallet with Flutterwave-powered transactions",
  },
  {
    icon: Shield,
    title: "Trust Ratings",
    description: "AI-powered ratings ensure reliable group members",
  },
  {
    icon: TrendingUp,
    title: "Earn Interest",
    description: "Lock funds and earn competitive interest rates",
  },
];

const benefits = [
  "Automated contributions & payouts",
  "Real-time group chat & notifications",
  "Transparent transaction history",
  "Member verification with BVN",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="relative overflow-hidden bg-hero-pattern">
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-gold/5" />
        
        <div className="relative container mx-auto px-4 py-6">
          {/* Nav */}
          <nav className="flex items-center justify-between mb-16">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <WeSaveLogo className="h-12" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <Link to="/auth">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
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
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Grow Together
              </span>
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
              <Link to="/groups">
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

      {/* Features Section */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Everything You Need to Save Smarter
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our platform combines traditional rotating savings with modern technology
              for a seamless experience.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-2xl bg-background border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-10 md:p-16 text-center"
          >
            <div className="absolute inset-0 opacity-10">
              <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-white" />
              <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-white" />
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
                Ready to Start Your Thrift Journey?
              </h2>
              <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
                Join thousands of Africans saving smarter together. 
                Create your account in minutes and start building your financial future.
              </p>
              <Link to="/auth?mode=signup">
                <Button variant="gold" size="xl">
                  Get Started for Free
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground space-y-2">
          <p>© 2025 WeSave. All rights reserved. 2% service fee applies on payouts.</p>
          <p>WeSave is owned by <strong className="text-foreground">LLH Premium Enterprise</strong>. Technology supported by Flutterwave.</p>
          <p>Contact: 09039479954 | IG: <a href="https://instagram.com/Wesave.ng" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@Wesave.ng</a></p>
        </div>
      </footer>
    </div>
  );
}
