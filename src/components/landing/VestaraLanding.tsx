import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Wallet, CreditCard, Building2, Layers, ShieldCheck, Banknote,
  Globe2, Sparkles, CheckCircle2, Network, Cpu, Lock, Zap, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import vestaraLogo from "@/assets/vestara-logo.jpg";

/* ---------- helpers ---------- */
function Counter({ to, suffix = "", decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => v.toFixed(decimals));
  useEffect(() => {
    if (inView) {
      const controls = animate(mv, to, { duration: 2, ease: "easeOut" });
      return controls.stop;
    }
  }, [inView, to, mv]);
  return (
    <span ref={ref}>
      <motion.span>{rounded}</motion.span>{suffix}
    </span>
  );
}

const navigateAuth = () => { window.location.href = "/vfd-sandbox/auth"; };
const navigateDemo = () => { window.location.href = "mailto:hello@vestara.ng?subject=Book%20a%20Demo"; };

/* ---------- sections ---------- */
const products = [
  { icon: Wallet, title: "Digital Wallets", desc: "Create secure multi-purpose wallets for individuals and businesses." },
  { icon: Banknote, title: "Payment Processing", desc: "Accept and move money seamlessly across channels." },
  { icon: Building2, title: "Virtual Accounts", desc: "Enable account-based collections and instant reconciliation." },
  { icon: CreditCard, title: "Card Issuance", desc: "Launch physical and virtual cards at scale." },
  { icon: Layers, title: "Embedded Finance", desc: "Integrate financial services directly into your customer experience." },
  { icon: ShieldCheck, title: "Compliance & Risk", desc: "Built-in KYC, AML, transaction monitoring, and fraud controls." },
];

const trustSegments = ["Fintechs", "Banks", "Marketplaces", "Corporates", "Governments", "Digital Platforms"];

const highlights = [
  "Scalable Infrastructure", "Recurring Revenue Model", "B2B and B2B2C Distribution",
  "Compliance-Driven Framework", "Regional Expansion Ready", "Banking & Fintech Partnerships",
];

const coreLayers = ["Wallets", "Payments", "Cards", "Collections", "Treasury", "Compliance", "APIs"];
const consumers = ["Fintechs", "Banks", "Corporates", "Marketplaces", "Governments"];

export default function VestaraLanding() {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050816] text-white antialiased selection:bg-violet-500/30 selection:text-white">
      {/* ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[36rem] h-[36rem] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[36rem] h-[36rem] rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full bg-fuchsia-600/10 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-50 sticky top-0 backdrop-blur-xl bg-[#050816]/70 border-b border-white/5">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={vestaraLogo} alt="Vestara" className="h-9 w-9 rounded-lg ring-1 ring-white/10" />
            <span className="font-semibold text-lg tracking-tight">Vestara</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/5" onClick={navigateDemo}>
              Book a Demo
            </Button>
            <Button
              size="sm"
              className="bg-white text-[#050816] hover:bg-white/90 shadow-lg"
              onClick={navigateAuth}
            >
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* HERO */}
        <section className="container mx-auto px-6 pt-24 pb-32 md:pt-32 md:pb-40">
          <div className="max-w-5xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/70 mb-8"
            >
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              Financial infrastructure for emerging markets
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-semibold leading-[1.05] tracking-[-0.03em]"
            >
              Building the Financial{" "}
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                Infrastructure
              </span>{" "}
              for the Next Billion Users
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="mt-8 text-lg md:text-xl text-white/60 max-w-3xl mx-auto leading-relaxed"
            >
              Vestara enables businesses, fintechs, financial institutions, and digital platforms to launch,
              scale, and embed financial services through secure payment infrastructure, digital wallets,
              virtual accounts, card issuance, collections, compliance, and treasury solutions.
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="mt-4 text-sm text-white/40 italic"
            >
              Built for growth. Designed for scale. Trusted for the future.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="mt-10 flex flex-col sm:flex-row gap-3 justify-center"
            >
              <Button size="xl" className="bg-white text-[#050816] hover:bg-white/90 shadow-2xl shadow-violet-500/20" onClick={navigateAuth}>
                Get Started <ArrowRight className="h-5 w-5" />
              </Button>
              <Button size="xl" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={navigateDemo}>
                Book a Demo
              </Button>
            </motion.div>

            {/* Trust bar */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              className="mt-20"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-5">Built for</p>
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
                {trustSegments.map((s, i) => (
                  <motion.span
                    key={s}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 + i * 0.05 }}
                    className="text-sm font-medium text-white/50 hover:text-white transition-colors"
                  >
                    {s}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Floating mock dashboard */}
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8 }}
            className="relative mt-24 max-w-5xl mx-auto"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-violet-500/20 to-cyan-500/20 blur-3xl -z-10" />
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-1 shadow-2xl">
              <div className="rounded-xl bg-gradient-to-br from-[#0a0f24] to-[#050816] p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  </div>
                  <span className="text-xs font-mono text-white/40">api.vestara.io / live</span>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { label: "Total Volume", value: "$2.4B", trend: "+18.2%" },
                    { label: "Transactions", value: "48.2M", trend: "+24.7%" },
                    { label: "Active Wallets", value: "12.1M", trend: "+9.4%" },
                  ].map((s, i) => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                      className="rounded-lg bg-white/5 border border-white/5 p-4"
                    >
                      <p className="text-xs text-white/40 uppercase tracking-wider">{s.label}</p>
                      <p className="text-2xl font-semibold mt-1">{s.value}</p>
                      <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> {s.trend}
                      </p>
                    </motion.div>
                  ))}
                </div>
                {/* Live API stream */}
                <div className="mt-5 rounded-lg bg-black/40 border border-white/5 p-4 font-mono text-xs text-white/70 overflow-hidden">
                  {[
                    `POST /v1/wallets ··· 201 created  ··· wallet_8h2k`,
                    `POST /v1/payments ··· 200 ok ··· $12,400 settled`,
                    `POST /v1/cards/issue ··· 201 created ··· card_3f9q`,
                  ].map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }} transition={{ delay: 0.4 + i * 0.2 }}
                      className="flex items-center gap-2 py-0.5"
                    >
                      <span className="text-emerald-400">▸</span>
                      <span>{line}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* PRODUCT GRID */}
        <section className="container mx-auto px-6 py-24 md:py-32">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em]">
              Everything You Need to Build Financial Products
            </h2>
            <p className="mt-5 text-lg text-white/60 leading-relaxed">
              Whether you're launching a digital bank, issuing cards, collecting payments, managing
              treasury operations, or embedding financial services into your platform, Vestara provides
              the infrastructure to move faster while staying compliant.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                className="group relative rounded-2xl p-px bg-gradient-to-b from-white/10 to-white/0 hover:from-violet-400/40 hover:to-cyan-400/10 transition-all"
              >
                <div className="rounded-2xl bg-[#0a0f24]/80 backdrop-blur-xl p-7 h-full">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center mb-5">
                    <p.icon className="h-5 w-5 text-violet-300" />
                  </div>
                  <h3 className="font-semibold text-lg">{p.title}</h3>
                  <p className="text-sm text-white/55 mt-2 leading-relaxed">{p.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* STATS */}
        <section className="container mx-auto px-6 py-24">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em]">Designed for Scale</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 max-w-5xl mx-auto">
            {[
              { val: <><Counter to={99.99} decimals={2} suffix="%" /></>, label: "Platform Availability" },
              { val: "Enterprise", label: "Grade Security" },
              { val: "API-First", label: "Infrastructure" },
              { val: "Multi-Tenant", label: "Architecture" },
              { val: <><Counter to={1} suffix="M+" /></>, label: "Transactions / Day Ready" },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                className="text-center rounded-2xl border border-white/5 bg-white/[0.02] p-6"
              >
                <div className="text-2xl md:text-3xl font-semibold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                  {s.val}
                </div>
                <p className="text-xs text-white/50 mt-2 uppercase tracking-wider">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* INVESTORS */}
        <section className="container mx-auto px-6 py-24 md:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            <div>
              <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-tight">
                Why Investors and Partners Choose Vestara
              </h2>
              <p className="mt-6 text-white/60 leading-relaxed">
                Vestara is positioned at the intersection of financial infrastructure, embedded finance,
                digital payments, and banking-as-a-service.
              </p>
              <p className="mt-4 text-white/60 leading-relaxed">
                Our platform addresses one of the largest opportunities in emerging markets: enabling
                businesses to launch and scale financial products without the complexity of building core
                infrastructure from scratch.
              </p>
              <p className="mt-4 text-white/60 leading-relaxed">
                As digital commerce grows, financial services are becoming embedded into every customer
                journey. Vestara provides the rails powering that transformation.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {highlights.map((h, i) => (
                <motion.div
                  key={h}
                  initial={{ opacity: 0, x: 10 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4"
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-white/80">{h}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ARCHITECTURE */}
        <section className="container mx-auto px-6 py-24">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em]">
              One Platform. Endless Possibilities.
            </h2>
          </div>
          <div className="max-w-4xl mx-auto rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-10">
            {/* Core */}
            <motion.div
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="mx-auto w-fit"
            >
              <div className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 text-white font-semibold flex items-center gap-2 shadow-2xl shadow-violet-500/30">
                <Cpu className="h-4 w-4" /> Vestara Core Platform
              </div>
            </motion.div>

            <div className="flex justify-center my-6">
              <div className="w-px h-10 bg-gradient-to-b from-white/40 to-white/0" />
            </div>

            {/* Layers */}
            <div className="flex flex-wrap justify-center gap-2">
              {coreLayers.map((l, i) => (
                <motion.span
                  key={l}
                  initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                  className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80"
                >
                  {l}
                </motion.span>
              ))}
            </div>

            <div className="flex justify-center my-6">
              <div className="w-px h-10 bg-gradient-to-b from-white/40 to-white/0" />
            </div>

            {/* Consumers */}
            <div className="flex flex-wrap justify-center gap-2">
              {consumers.map((c, i) => (
                <motion.span
                  key={c}
                  initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                  className="px-4 py-2 rounded-lg bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border border-violet-400/20 text-sm text-white/90"
                >
                  {c}
                </motion.span>
              ))}
            </div>
          </div>
        </section>

        {/* DIFFERENTIATOR */}
        <section className="container mx-auto px-6 py-24">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70 mb-6">
              <Network className="h-3.5 w-3.5 text-cyan-400" /> The Vestara difference
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em]">More Than Payments</h2>
            <p className="mt-6 text-lg text-white/60 leading-relaxed">
              Most providers solve one part of the financial ecosystem.
            </p>
            <p className="mt-3 text-lg text-white/60 leading-relaxed">
              Vestara connects payments, wallets, accounts, cards, compliance, and treasury into a single
              infrastructure layer—allowing organizations to launch products faster, reduce operational
              complexity, and unlock new revenue opportunities.
            </p>
          </div>
        </section>

        {/* VISION */}
        <section className="container mx-auto px-6 py-24">
          <div className="max-w-4xl mx-auto relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/15 via-[#0a0f24] to-cyan-600/10 p-10 md:p-16">
            <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative">
              <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em]">Our Vision</h2>
              <p className="mt-6 text-lg text-white/70 leading-relaxed max-w-3xl">
                To become the financial operating system for emerging markets, enabling businesses and
                institutions to access world-class financial infrastructure without borders, barriers,
                or limitations.
              </p>
            </div>
          </div>
        </section>

        {/* GLOBAL EXPANSION */}
        <section className="container mx-auto px-6 py-24">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70 mb-6">
                <Globe2 className="h-3.5 w-3.5 text-cyan-400" /> Global reach
              </div>
              <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-tight">
                Built in Africa. <br /> Designed for the World.
              </h2>
              <p className="mt-6 text-white/60 leading-relaxed">
                Vestara combines local market expertise with globally aligned infrastructure standards,
                creating solutions that scale across industries, regions, and regulatory environments.
              </p>
            </div>
            <div className="relative aspect-square rounded-3xl border border-white/10 bg-[#0a0f24] overflow-hidden flex items-center justify-center">
              <Globe2 className="w-full h-full text-white/5 absolute inset-0 p-8" strokeWidth={0.5} />
              {/* orbit pings */}
              {[
                { top: "30%", left: "25%" },
                { top: "55%", left: "65%" },
                { top: "40%", left: "75%" },
                { top: "70%", left: "30%" },
              ].map((p, i) => (
                <motion.span
                  key={i}
                  className="absolute w-2.5 h-2.5 rounded-full bg-cyan-400"
                  style={p as any}
                  animate={{ scale: [1, 2, 1], opacity: [1, 0.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                />
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="container mx-auto px-6 py-24">
          <div className="relative max-w-5xl mx-auto overflow-hidden rounded-3xl border border-white/10 p-12 md:p-20 text-center bg-gradient-to-br from-violet-600/20 via-[#0a0f24] to-cyan-600/20">
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative">
              <h2 className="text-4xl md:text-6xl font-semibold tracking-[-0.02em]">
                Ready to Build the Future of Finance?
              </h2>
              <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto">
                Launch faster. Scale confidently. Innovate without limits.
              </p>
              <p className="mt-3 text-white/55 max-w-2xl mx-auto">
                Whether you're a startup, enterprise, bank, fintech, or government institution, Vestara
                provides the infrastructure needed to power your next stage of growth.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="xl" className="bg-white text-[#050816] hover:bg-white/90" onClick={navigateAuth}>
                  Start Building <ArrowRight className="h-5 w-5" />
                </Button>
                <Button size="xl" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={navigateDemo}>
                  Speak With Our Team
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-white/5 mt-10">
          <div className="container mx-auto px-6 py-12 flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={vestaraLogo} alt="Vestara" className="h-9 w-9 rounded-lg ring-1 ring-white/10" />
              <div>
                <p className="font-semibold">Vestara</p>
                <p className="text-xs text-white/50">Powering the Future of Financial Infrastructure.</p>
              </div>
            </div>
            <div className="flex gap-6 text-sm text-white/50">
              <a href="/terms" className="hover:text-white">Terms</a>
              <a href="/privacy" className="hover:text-white">Privacy</a>
              <a href="/kyc-policy" className="hover:text-white">KYC</a>
              <a href="/aml-policy" className="hover:text-white">AML</a>
            </div>
            <p className="text-xs text-white/40">© {new Date().getFullYear()} Vestara</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
