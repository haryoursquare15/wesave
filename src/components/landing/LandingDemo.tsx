import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, CreditCard, ArrowLeftRight, Wallet, Banknote, RefreshCw,
  ChevronLeft, ChevronRight, Shield, CheckCircle2, Clock, ArrowDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface DemoStep {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  mockUI: React.ReactNode;
}

function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="rounded-[2rem] border-2 border-border bg-card shadow-xl overflow-hidden">
        {/* Notch */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-20 h-1 rounded-full bg-border" />
        </div>
        <div className="px-3 pb-4 min-h-[340px]">
          {children}
        </div>
      </div>
    </div>
  );
}

// Step 1: Joining a group
function JoinGroupMock() {
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold text-foreground mb-2">Available Groups</div>
      {[
        { name: "Emerald Circle", amount: "₦20,000", members: "5/6", badge: "Gold" },
        { name: "Savings Warriors", amount: "₦5,000", members: "3/4", badge: "Bronze" },
      ].map((g) => (
        <div key={g.name} className="rounded-lg border border-border bg-background p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">{g.name}</span>
            <Badge variant="outline" className="text-[9px] h-4">{g.badge}</Badge>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{g.amount}/month</span>
            <span>{g.members} members</span>
          </div>
          <Progress value={parseInt(g.members) / parseInt(g.members.split("/")[1]) * 100} className="h-1.5" />
          <Button size="sm" className="w-full h-6 text-[10px]">Request to Join</Button>
        </div>
      ))}
    </div>
  );
}

// Step 2: Contributing
function ContributionMock() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-center">
        <div className="text-[10px] text-muted-foreground mb-1">Cycle 2 — Due in 3 days</div>
        <div className="text-xl font-bold text-foreground">₦20,000</div>
        <div className="text-[10px] text-muted-foreground">Monthly Contribution</div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-success" />
          <span>Cycle 1 — Paid ₦20,000</span>
          <span className="ml-auto text-success text-[9px]">✓ On time</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-foreground font-medium">
          <Clock className="h-3 w-3 text-warning" />
          <span>Cycle 2 — ₦20,000 due</span>
          <span className="ml-auto text-warning text-[9px]">Pending</span>
        </div>
      </div>
      <Button className="w-full h-7 text-[10px]">
        <CreditCard className="h-3 w-3 mr-1" />
        Pay ₦20,000 Now
      </Button>
      <div className="text-center text-[9px] text-muted-foreground">
        or enable auto-debit from your card
      </div>
    </div>
  );
}

// Step 3: Auto-sweep
function AutoSweepMock() {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-foreground">Auto-Contribution Sweep</div>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-medium text-foreground">Recurring Charge Active</span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Your card ending <span className="font-mono">•••• 4521</span> is charged automatically on each cycle date.
        </div>
      </div>
      <div className="space-y-1.5 text-[10px]">
        {["Jan 15 — ₦20,000 swept ✓", "Feb 15 — ₦20,000 swept ✓", "Mar 15 — Scheduled"].map((item, i) => (
          <div key={i} className={cn("flex items-center gap-2 rounded-md px-2 py-1",
            i < 2 ? "bg-success/10 text-success" : "bg-muted/30 text-muted-foreground"
          )}>
            {i < 2 ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Step 4: Payout
function PayoutMock() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-gradient-to-br from-success/20 to-success/5 border border-success/30 p-3 text-center space-y-1">
        <CheckCircle2 className="h-6 w-6 text-success mx-auto" />
        <div className="text-xs font-semibold text-foreground">Payout Received!</div>
        <div className="text-2xl font-bold text-foreground">₦114,000</div>
        <div className="text-[10px] text-muted-foreground">
          ₦120,000 total · ₦6,000 platform fee (5%)
        </div>
      </div>
      <div className="rounded-md border border-border p-2 text-[10px] space-y-1">
        <div className="flex justify-between text-muted-foreground">
          <span>Sent to</span>
          <span className="font-medium text-foreground">GTBank •••4821</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Reference</span>
          <span className="font-mono text-foreground">WS-PAY-00238</span>
        </div>
      </div>
    </div>
  );
}

// Step 5: Swap position
function SwapMock() {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-foreground">Position Swap Request</div>
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <div className="text-center">
            <div className="font-medium text-foreground">You</div>
            <div className="text-lg font-bold text-foreground">Pos #5</div>
            <div className="text-muted-foreground">Payout: June</div>
          </div>
          <ArrowLeftRight className="h-5 w-5 text-warning" />
          <div className="text-center">
            <div className="font-medium text-foreground">Ada O.</div>
            <div className="text-lg font-bold text-foreground">Pos #2</div>
            <div className="text-muted-foreground">Payout: March</div>
          </div>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground text-center">
        Both members must agree. One swap per cycle allowed.
      </div>
      <Button className="w-full h-7 text-[10px]" variant="outline">
        <ArrowLeftRight className="h-3 w-3 mr-1" />
        Request Swap
      </Button>
    </div>
  );
}

// Step 6: Fund & Withdraw
function FundWithdrawMock() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-background p-3 text-center space-y-1">
        <div className="text-[10px] text-muted-foreground">Wallet Balance</div>
        <div className="text-xl font-bold text-foreground">₦134,500</div>
        <div className="text-[9px] text-muted-foreground">Available for withdrawal</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" className="h-8 text-[10px]">
          <ArrowDown className="h-3 w-3 mr-1" />
          Fund Wallet
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-[10px]">
          <Banknote className="h-3 w-3 mr-1" />
          Withdraw
        </Button>
      </div>
      <div className="text-[10px] text-muted-foreground space-y-1">
        <div className="flex items-center gap-1.5">
          <Shield className="h-3 w-3 text-primary" />
          Withdrawals processed to verified bank only
        </div>
        <div className="flex items-center gap-1.5">
          <Shield className="h-3 w-3 text-primary" />
          Daily limit: ₦500,000
        </div>
      </div>
    </div>
  );
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: "join",
    title: "Join a Thrift Group",
    subtitle: "Browse the pool, find a group that fits your budget, and request to join.",
    icon: Users,
    color: "text-primary",
    mockUI: <JoinGroupMock />,
  },
  {
    id: "contribute",
    title: "Make Contributions",
    subtitle: "Pay your share each cycle — manually or by auto-debit from your card.",
    icon: CreditCard,
    color: "text-success",
    mockUI: <ContributionMock />,
  },
  {
    id: "sweep",
    title: "Auto-Sweep Contributions",
    subtitle: "Link your card once. Contributions are charged automatically each cycle.",
    icon: RefreshCw,
    color: "text-primary",
    mockUI: <AutoSweepMock />,
  },
  {
    id: "payout",
    title: "Receive Your Payout",
    subtitle: "When it's your turn, the full pot is paid to your wallet instantly.",
    icon: Banknote,
    color: "text-success",
    mockUI: <PayoutMock />,
  },
  {
    id: "swap",
    title: "Swap Positions",
    subtitle: "Need funds sooner? Request a swap with another member in your group.",
    icon: ArrowLeftRight,
    color: "text-warning",
    mockUI: <SwapMock />,
  },
  {
    id: "wallet",
    title: "Fund & Withdraw",
    subtitle: "Top up your wallet or withdraw earnings to your verified bank account.",
    icon: Wallet,
    color: "text-primary",
    mockUI: <FundWithdrawMock />,
  },
];

export function LandingDemo() {
  const [active, setActive] = useState(0);

  const goTo = (i: number) => setActive(Math.max(0, Math.min(DEMO_STEPS.length - 1, i)));

  return (
    <section className="py-20 bg-card/50" id="demo">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <Badge variant="outline" className="mb-3 text-xs">Interactive Demo</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            See How WeSave Works
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Walk through every step — from joining a group to receiving your payout. No sign-up needed.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-10 items-center max-w-5xl mx-auto">
          {/* Left: Step list */}
          <div className="space-y-2">
            {DEMO_STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === active;
              return (
                <motion.button
                  key={step.id}
                  onClick={() => setActive(i)}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200 border",
                    isActive
                      ? "bg-primary/5 border-primary/30 shadow-sm"
                      : "bg-transparent border-transparent hover:bg-muted/30"
                  )}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className={cn(
                    "flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                    isActive ? "bg-primary/10" : "bg-muted/30"
                  )}>
                    <Icon className={cn("h-4 w-4", isActive ? step.color : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-bold",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h3 className={cn(
                        "text-sm font-semibold truncate",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {step.title}
                      </h3>
                    </div>
                    {isActive && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="text-xs text-muted-foreground mt-1 leading-relaxed"
                      >
                        {step.subtitle}
                      </motion.p>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Right: Mock phone */}
          <div className="flex flex-col items-center gap-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.97 }}
                transition={{ duration: 0.3 }}
                className="w-full"
              >
                <MockPhone>{DEMO_STEPS[active].mockUI}</MockPhone>
              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => goTo(active - 1)}
                disabled={active === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex gap-1.5">
                {DEMO_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === active ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
                    )}
                  />
                ))}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => goTo(active + 1)}
                disabled={active === DEMO_STEPS.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
