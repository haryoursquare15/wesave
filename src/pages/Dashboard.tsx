import { motion } from "framer-motion";
import { Plus, Bell, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { WalletCard } from "@/components/WalletCard";
import { ThriftGroupCard } from "@/components/ThriftGroupCard";
import { UserBadge } from "@/components/UserBadge";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";

// Mock data
const myGroups = [
  {
    id: "1",
    name: "Family Savings Circle",
    rating: 4.5,
    memberCount: 5,
    maxMembers: 6,
    contributionAmount: 50000,
    period: "weekly" as const,
    isMember: true,
    isActive: true,
    pendingRequests: 2,
  },
  {
    id: "2",
    name: "Office Thrift Club",
    rating: 4.8,
    memberCount: 10,
    maxMembers: 10,
    contributionAmount: 25000,
    period: "monthly" as const,
    isMember: true,
    isActive: true,
    pendingRequests: 0,
  },
];

const quickActions = [
  { label: "Fund Wallet", icon: "💰" },
  { label: "New Group", icon: "👥" },
  { label: "Invite", icon: "📨" },
  { label: "Lock Funds", icon: "🔒" },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground font-semibold">
                JD
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Welcome back,</p>
                <h2 className="font-semibold text-foreground">John Doe</h2>
              </div>
              <UserBadge type="silver" size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-coral text-[10px] text-coral-foreground flex items-center justify-center">
                  3
                </span>
              </Button>
              <Button variant="ghost" size="icon">
                <Search className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Wallet Card */}
        <WalletCard
          balance={250000}
          lockedBalance={50000}
          onFund={() => console.log("Fund")}
          onWithdraw={() => console.log("Withdraw")}
        />

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <motion.button
              key={action.label}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
            >
              <span className="text-2xl">{action.icon}</span>
              <span className="text-xs font-medium text-muted-foreground">
                {action.label}
              </span>
            </motion.button>
          ))}
        </div>

        {/* My Groups */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">My Thrift Groups</h3>
            <Link to="/groups">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </div>

          <div className="space-y-4">
            {myGroups.map((group) => (
              <ThriftGroupCard key={group.id} {...group} />
            ))}
          </div>
        </section>

        {/* Create Group CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl bg-gradient-to-br from-gold/10 to-gold/5 border border-gold/20"
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gold/20 flex items-center justify-center">
              <Plus className="h-6 w-6 text-gold" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-foreground">Create a New Thrift Group</h4>
              <p className="text-sm text-muted-foreground">
                Invite friends and start saving together
              </p>
            </div>
            <Link to="/create-group">
              <Button variant="gold" size="sm">
                Create
              </Button>
            </Link>
          </div>
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}
