import { motion } from "framer-motion";
import { UserPlus, Users, Banknote, Trophy } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Create an Account",
    description: "Sign up in minutes with your email. Complete your profile and verify your identity.",
  },
  {
    icon: Users,
    step: "02",
    title: "Join or Create a Group",
    description: "Browse public groups or create your own. Invite trusted friends, family, or colleagues.",
  },
  {
    icon: Banknote,
    step: "03",
    title: "Contribute Regularly",
    description: "Make contributions on schedule — manually or via auto-debit. Track every naira in real time.",
  },
  {
    icon: Trophy,
    step: "04",
    title: "Receive Your Payout",
    description: "When it's your turn, the full pot is paid directly to your bank account. Simple and transparent.",
  },
];

export function LandingHowItWorks() {
  return (
    <section className="py-20 bg-background" id="how-it-works">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">How It Works</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Start Saving in 4 Simple Steps
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            From sign-up to payout, we've made the entire process simple, secure, and transparent.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
              className="relative text-center"
            >
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-[2px] bg-border" />
              )}

              <div className="relative z-10 mx-auto h-20 w-20 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center mb-5">
                <step.icon className="h-8 w-8 text-primary" />
                <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center">
                  {step.step}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
