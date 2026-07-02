import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Shield,
  Wallet,
  PiggyBank,
  Zap,
  Banknote,
  TrendingUp,
  Smartphone,
  CheckCircle2,
  Users,
  Split,
  Target,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import vestaraLogo from "@/assets/vestara-logo.jpg";

// ---- SEO helpers (no extra dependency) ----
const setMeta = (key: string, content: string, attr: "name" | "property" = "name") => {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

const setLink = (rel: string, href: string) => {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

const setJsonLd = (id: string, data: unknown) => {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.id = id;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
};

// Star products — top USPs (Split Pay & Savings products) lead, broader features follow.
const starProducts = [
  {
    icon: Split,
    title: "Split Pay — Pay Bills Together",
    desc: "Split rent, subscriptions, dinner or any bill in seconds. Each person pays their share automatically — no chasing, no spreadsheets.",
    badge: "Most Loved",
  },
  {
    icon: Sparkles,
    title: "Vestara Savings — Earn Daily Interest",
    desc: "Lock funds in Flex, Fixed, Target or Group plans and earn competitive daily interest. Withdraw anytime on Flex; bigger returns when you commit.",
    badge: "High Yield",
  },
  {
    icon: Target,
    title: "Target Ajo — Save Towards A Goal",
    desc: "Invite trusted friends or save solo. Hit your target faster with reminders, group votes and transparent contributions.",
    badge: "Goal Focused",
  },
];

const features = [
  { icon: PiggyBank, title: "Smart Auto-Save", desc: "Schedule daily, weekly or monthly contributions straight from your wallet." },
  { icon: Banknote, title: "Real Bank Account", desc: "Get a dedicated Nigerian bank account powered by VFD Microfinance Bank." },
  { icon: Users, title: "Group Ajo & Esusu", desc: "Run rotating savings circles with automated payouts and full transparency." },
  { icon: Shield, title: "Secured Transactions", desc: "End-to-end encryption, transaction PINs, 2FA, and audited ledgers." },
  { icon: TrendingUp, title: "Credit Building", desc: "Build a verifiable financial reputation as you save and contribute on time." },
  { icon: Zap, title: "Instant Transfers", desc: "Real-time payments to any Nigerian bank — no queues, no surprises." },
];

const steps = [
  { n: "01", t: "Create your account", d: "Sign up in under 2 minutes — KYC compliant with BVN verification." },
  { n: "02", t: "Fund your wallet", d: "Top up from any bank or card. Funds settle instantly." },
  { n: "03", t: "Save, split & grow", d: "Lock savings, split bills, join ajo groups and earn daily interest." },
];

export default function VestaraLanding() {
  const handleStart = () => {
    window.location.href = "/vfd-sandbox/auth";
  };
  const handleSignIn = () => {
    window.location.href = "/vfd-sandbox/auth";
  };

  // SEO: set page-specific head tags + structured data for Vestara
  useEffect(() => {
    const title = "Vestara — Smart Savings, Split Pay & Ajo Banking in Nigeria";
    const description =
      "Vestara is a modern Nigerian savings & banking app — split bills with Split Pay, earn daily interest with Vestara Savings, and join Ajo/Esusu groups. Powered and supported by VFD Microfinance Bank.";
    const url = "https://www.vestara.ng/";
    const image = "https://www.vestara.ng/vestara-logo.jpg";

    document.title = title;
    setMeta("description", description);
    setMeta(
      "keywords",
      "vestara, split pay, split bill nigeria, ajo, esusu, daily interest savings, target ajo, vfd microfinance, online banking nigeria, group savings"
    );
    setMeta("robots", "index, follow, max-image-preview:large");
    setMeta("author", "Vestara");
    setMeta("theme-color", "#0F172A");

    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:type", "website", "property");
    setMeta("og:url", url, "property");
    setMeta("og:image", image, "property");
    setMeta("og:site_name", "Vestara", "property");

    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    setMeta("twitter:image", image);

    setLink("canonical", url);

    setJsonLd("ld-organization", {
      "@context": "https://schema.org",
      "@type": "FinancialService",
      name: "Vestara",
      url,
      logo: image,
      description,
      areaServed: "NG",
      provider: {
        "@type": "BankOrCreditUnion",
        name: "VFD Microfinance Bank",
      },
      sameAs: ["https://www.vestara.ng"],
    });

    setJsonLd("ld-website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      url,
      name: "Vestara",
      potentialAction: {
        "@type": "SearchAction",
        target: `${url}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    });

    setJsonLd("ld-products", {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: starProducts.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.title,
        description: p.desc,
      })),
    });

    setJsonLd("ld-faq", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Vestara?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Vestara is a Nigerian savings and banking app that lets you split bills, earn daily interest on savings, and join Ajo/Esusu groups. It is powered and supported by VFD Microfinance Bank.",
          },
        },
        {
          "@type": "Question",
          name: "How does Split Pay work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Create a Split Pay request, invite friends, and each person pays their share directly. No chasing, no IOUs.",
          },
        },
        {
          "@type": "Question",
          name: "Is my money safe with Vestara?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Funds are held with VFD Microfinance Bank, and every transaction is protected by encryption, 2FA, and transaction PINs.",
          },
        },
      ],
    });
  }, []);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" aria-label="Vestara home">
            <img src={vestaraLogo} alt="Vestara logo" className="h-9 w-9 rounded-lg" />
            <span className="font-bold text-lg tracking-tight">Vestara</span>
          </a>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground px-2">Coming soon</span>
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
              <Banknote className="h-3.5 w-3.5" />
              Powered and supported by VFD Microfinance Bank
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-6xl font-bold leading-tight tracking-tight"
            >
              Split bills. Save smart.{" "}
              <span className="bg-gradient-to-r from-primary to-gold bg-clip-text text-transparent">
                Grow your money.
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 text-lg md:text-xl text-muted-foreground"
            >
              Vestara is the all-in-one Nigerian app for{" "}
              <strong className="text-foreground">Split Pay</strong>,{" "}
              <strong className="text-foreground">daily-interest savings</strong>, and{" "}
              <strong className="text-foreground">Ajo &amp; Esusu</strong> groups — built on bank-grade
              infrastructure.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-8 flex flex-col sm:flex-row gap-3 justify-center"
            >
              <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-muted text-muted-foreground text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Sign up &amp; sign in coming soon
              </div>
            </motion.div>
            <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
              {["No hidden fees", "Instant transfers", "Daily interest", "Split bills in seconds"].map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Star Products — USPs first */}
      <section id="products" className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">Vestara Products</span>
          <h2 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">
            Split Pay &amp; Vestara Savings — the smarter way to handle money
          </h2>
          <p className="mt-3 text-muted-foreground">
            The two products our users love most, built for everyday Nigerian life.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {starProducts.map((p, i) => (
            <motion.article
              key={p.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="relative p-6 rounded-2xl bg-gradient-to-br from-card to-card/50 border border-primary/20 hover:border-primary/50 transition-colors"
            >
              <span className="absolute top-4 right-4 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {p.badge}
              </span>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mb-4 shadow-lg">
                <p.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="font-bold text-lg leading-snug">{p.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{p.desc}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 py-16 md:py-24">
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
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Get started in minutes</h2>
          <p className="mt-3 text-muted-foreground">Three simple steps to your Vestara account.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {steps.map((s) => (
            <div key={s.n} className="p-6 rounded-2xl bg-card border border-border">
              <div className="text-3xl font-bold text-primary/40">{s.n}</div>
              <h3 className="mt-3 font-semibold text-lg">{s.t}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">{s.d}</p>
            </div>
          ))}
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
            Join thousands building their financial future with Vestara — Split Pay, savings & ajo, all in one app.
          </p>
          <div className="relative mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary-foreground/10 text-primary-foreground text-sm font-medium border border-primary-foreground/20">
            <Sparkles className="h-4 w-4" />
            Account sign-ups opening soon — stay tuned
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="container mx-auto px-4 flex flex-col md:flex-row gap-4 items-center justify-between text-sm text-muted-foreground">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="flex items-center gap-2">
              <img src={vestaraLogo} alt="Vestara logo" className="h-7 w-7 rounded-md" />
              <span>© {new Date().getFullYear()} Vestara. All rights reserved.</span>
            </div>
            <span className="hidden md:inline text-border">|</span>
            <span className="text-xs">Powered and supported by VFD Microfinance Bank</span>
          </div>
          <nav className="flex gap-4" aria-label="Footer">
            <a href="/terms" className="hover:text-primary">Terms</a>
            <a href="/privacy" className="hover:text-primary">Privacy</a>
            <a href="/kyc-policy" className="hover:text-primary">KYC</a>
            <a href="/aml-policy" className="hover:text-primary">AML</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
