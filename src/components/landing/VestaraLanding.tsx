import { motion } from "framer-motion";
import { ArrowRight, Shield, Wallet, PiggyBank, Zap, Banknote, Lock, TrendingUp, Smartphone, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import vestaraLogo from "@/assets/vestara-logo.jpg";

const features = [
  { icon: PiggyBank, title: "Smart Savings", desc: "Lock funds, earn daily interest, and hit your goals faster with auto-save." },
  { icon: Banknote, title: "Bank-Grade Wallet", desc: "Send, receive and pay bills instantly with a fully licensed banking partner." },
  { icon: Wallet, title: "Group Ajo & Esusu", desc: "Rotating savings circles with transparent, automated payouts." },
  { icon: Shield, title: "Secure by Default", desc: "BVN verification, encryption, 2FA and transaction PINs on every payment." },
  { icon: TrendingUp, title: "Credit Building", desc: "Build a verifiable financial reputation as you save and contribute." },
  { icon: Zap, title: "Instant Transfers", desc: "Real-time payments to any Nigerian bank — no waiting, no surprises." },
];

const steps = [
  { n: "01", t: "Create your account", d: "Sign up in under 2 minutes with your BVN — fully KYC compliant." },
  { n: "02", t: "Fund your wallet", d: "Top up from any bank or card. Funds settle instantly." },
  { n: "03", t: "Save, send, grow", d: "Lock savings, join ajo groups, pay bills and earn interest daily." },
];

export default function VestaraLanding() {
  const handleStart = () => { window.location.href = "/vfd-sandbox/auth"; };
  const handleSignIn = () => { window.location.href = "/vfd-sandbox/auth"; };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={vestaraLogo} alt="Vestara" className="h-9 w-9 rounded-lg" />
            <span className="font-bold text-lg tracking-tight">Vestara</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleSignIn}>Sign In</Button>
            <Button size="sm" onClick={handleStart}>Get Started</Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-gold/10" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative container mx-auto px-4 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6"
            >
              <Lock className="h-3.5 w-3.5" />
              Licensed banking partner • BVN secured
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-6xl font-bold leading-tight tracking-tight"
            >
              Smart savings,{" "}
              <span className="bg-gradient-to-r from-primary to-gold bg-clip-text text-transparent">
                modern banking
              </span>{" "}
              for everyone.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 text-lg md:text-xl text-muted-foreground"
            >
              Vestara is the all-in-one app for saving, sending money, and joining Ajo & Esusu groups —
              built on bank-grade infrastructure for Africa.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-8 flex flex-col sm:flex-row gap-3 justify-center"
            >
              <Button size="xl" onClick={handleStart}>
                Get Started Free <ArrowRight className="h-5 w-5" />
              </Button>
              <Button size="xl" variant="outline" onClick={handleSignIn}>
                <Smartphone className="h-5 w-5" /> Sign In
              </Button>
            </motion.div>
            <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
              {["No hidden fees", "Instant transfers", "Daily interest", "BVN verified"].map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you need to grow your money</h2>
          <p className="mt-3 text-muted-foreground">One app. Savings, payments, group ajo, and a real bank account.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="p-6 rounded-2xl bg-card border border-border hover:border-primary/40 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Get started in minutes</h2>
            <p className="mt-3 text-muted-foreground">Three simple steps to your Vestara account.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {steps.map((s) => (
              <div key={s.n} className="p-6 rounded-2xl bg-background border border-border">
                <div className="text-3xl font-bold text-primary/40">{s.n}</div>
                <h3 className="mt-3 font-semibold text-lg">{s.t}</h3>
                <p className="text-sm text-muted-foreground mt-1.5">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/70 p-10 md:p-16 text-center">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-gold/20 blur-3xl" />
          <h2 className="relative text-3xl md:text-5xl font-bold text-primary-foreground tracking-tight">
            Your money, smarter.
          </h2>
          <p className="relative mt-4 text-primary-foreground/80 max-w-xl mx-auto">
            Join thousands building their financial future with Vestara.
          </p>
          <Button
            size="xl"
            variant="secondary"
            className="relative mt-8"
            onClick={handleStart}
          >
            Create your account <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="container mx-auto px-4 flex flex-col md:flex-row gap-4 items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={vestaraLogo} alt="Vestara" className="h-7 w-7 rounded-md" />
            <span>© {new Date().getFullYear()} Vestara. All rights reserved.</span>
          </div>
          <div className="flex gap-4">
            <a href="/terms" className="hover:text-primary">Terms</a>
            <a href="/privacy" className="hover:text-primary">Privacy</a>
            <a href="/kyc-policy" className="hover:text-primary">KYC</a>
            <a href="/aml-policy" className="hover:text-primary">AML</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
