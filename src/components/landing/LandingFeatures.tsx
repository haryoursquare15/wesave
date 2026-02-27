import { motion } from "framer-motion";
import { Shield, Users, Wallet, TrendingUp, Bell, CreditCard } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Thrift Groups",
    description: "Create or join rotating savings groups with trusted members. Set contribution amounts, schedules, and payout order.",
  },
  {
    icon: Wallet,
    title: "Digital Wallet",
    description: "Secure wallet with Flutterwave-powered transactions. Fund, withdraw, and track your balance in real time.",
  },
  {
    icon: Shield,
    title: "Trust Ratings",
    description: "AI-powered trust scores ensure reliable group members. Build your reputation through consistent participation.",
  },
  {
    icon: TrendingUp,
    title: "Credit Building",
    description: "Build your credit score through consistent contributions and on-time payouts. Unlock higher-tier groups.",
  },
  {
    icon: CreditCard,
    title: "Auto-Debit",
    description: "Tokenize your card for automatic contributions. Never miss a payment — set it and forget it.",
  },
  {
    icon: Bell,
    title: "Smart Notifications",
    description: "Get reminders before contribution deadlines, payout alerts, and group activity updates via email.",
  },
];

export function LandingFeatures() {
  return (
    <section className="py-20 bg-card" id="features">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">Features</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Everything You Need to Save Smarter
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Our platform combines traditional rotating savings with modern fintech
            for a seamless, secure experience.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className="group p-6 rounded-2xl bg-background border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
