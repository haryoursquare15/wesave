import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, Settings, Send, CheckCircle2,
  ChevronLeft, ChevronRight, PlusCircle, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="rounded-[2rem] border-2 border-border bg-card shadow-xl overflow-hidden">
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

// Step 1: Admin creates group
function CreateGroupMock() {
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold text-foreground mb-1">Create Thrift Group</div>
      <div className="space-y-2">
        {[
          { label: "Group Name", value: "Emerald Circle" },
          { label: "Contribution Amount", value: "₦20,000" },
          { label: "Period", value: "Monthly" },
          { label: "Max Members", value: "6" },
        ].map((field) => (
          <div key={field.label} className="rounded-md border border-border bg-background px-2.5 py-1.5">
            <div className="text-[9px] text-muted-foreground">{field.label}</div>
            <div className="text-xs font-medium text-foreground">{field.value}</div>
          </div>
        ))}
      </div>
      <Button className="w-full h-7 text-[10px] mt-1">
        <PlusCircle className="h-3 w-3 mr-1" />
        Create Group
      </Button>
    </div>
  );
}

// Step 2: Group created confirmation
function GroupCreatedMock() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-success/10 border border-success/30 p-3 text-center space-y-1.5">
        <CheckCircle2 className="h-7 w-7 text-success mx-auto" />
        <div className="text-xs font-semibold text-foreground">Group Created!</div>
        <div className="text-sm font-bold text-foreground">Emerald Circle</div>
      </div>
      <div className="rounded-md border border-border p-2.5 space-y-1.5 text-[10px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Contribution</span>
          <span className="font-medium text-foreground">₦20,000/month</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Members</span>
          <span className="font-medium text-foreground">1/6 (You)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <Badge variant="secondary" className="text-[9px] h-4">Pending</Badge>
        </div>
      </div>
      <div className="text-center text-[9px] text-muted-foreground">
        Add members to fill your group and start the cycle.
      </div>
    </div>
  );
}

// Step 3: Admin adds members via invite
function AddMembersMock() {
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold text-foreground">Add Members</div>
      <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5 mb-1">
          <Mail className="h-3 w-3 text-primary" />
          <span className="font-medium text-foreground">Invite via Email</span>
        </div>
        Share an invite link or enter emails directly.
      </div>
      <div className="space-y-1.5">
        {["ada@email.com", "chidi@email.com", "kemi@email.com"].map((email) => (
          <div key={email} className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[10px]">
            <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary">
              {email.charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 text-foreground">{email}</span>
            <Badge variant="outline" className="text-[8px] h-3.5">Invited</Badge>
          </div>
        ))}
      </div>
      <Button className="w-full h-7 text-[10px]">
        <Send className="h-3 w-3 mr-1" />
        Send Invites
      </Button>
    </div>
  );
}

// Step 4: Members join and group fills up
function MembersJoinMock() {
  const members = [
    { name: "You (Admin)", status: "joined" },
    { name: "Ada O.", status: "joined" },
    { name: "Chidi N.", status: "joined" },
    { name: "Kemi B.", status: "joined" },
    { name: "Emeka A.", status: "joined" },
    { name: "Slot 6", status: "waiting" },
  ];
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold text-foreground">Emerald Circle — Members</div>
      <Progress value={83} className="h-2" />
      <div className="text-[10px] text-muted-foreground text-right">5/6 members joined</div>
      <div className="space-y-1">
        {members.map((m, i) => (
          <div key={i} className={cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[10px]",
            m.status === "joined" ? "bg-success/5 border border-success/20" : "bg-muted/20 border border-dashed border-border"
          )}>
            <div className={cn(
              "h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold",
              m.status === "joined" ? "bg-success/20 text-success" : "bg-muted/30 text-muted-foreground"
            )}>
              {m.status === "joined" ? "✓" : "?"}
            </div>
            <span className={cn(
              "flex-1",
              m.status === "joined" ? "text-foreground" : "text-muted-foreground"
            )}>
              {m.name}
            </span>
            {i === 0 && <Badge variant="outline" className="text-[8px] h-3.5">Admin</Badge>}
            {m.status === "joined" && i > 0 && (
              <span className="text-success text-[9px]">Joined</span>
            )}
          </div>
        ))}
      </div>
      <div className="text-center text-[9px] text-muted-foreground">
        Once all members join, payout order is randomized and the cycle begins.
      </div>
    </div>
  );
}

interface DemoStep {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  mockUI: React.ReactNode;
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: "create",
    title: "Admin Creates a Group",
    subtitle: "Set the group name, contribution amount, frequency, and max members.",
    icon: Settings,
    color: "text-primary",
    mockUI: <CreateGroupMock />,
  },
  {
    id: "created",
    title: "Group is Created",
    subtitle: "Your group is live in pending status, waiting for members to join.",
    icon: CheckCircle2,
    color: "text-success",
    mockUI: <GroupCreatedMock />,
  },
  {
    id: "invite",
    title: "Admin Invites Members",
    subtitle: "Send invite links via email. Members receive a link to join your group.",
    icon: UserPlus,
    color: "text-primary",
    mockUI: <AddMembersMock />,
  },
  {
    id: "fill",
    title: "Members Join the Group",
    subtitle: "As members accept invites, the group fills up. The cycle starts once it's full.",
    icon: Users,
    color: "text-success",
    mockUI: <MembersJoinMock />,
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
            See How It Works
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Walk through how a thrift group is created and members are added — step by step.
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
