import { motion } from "framer-motion";
import { Plus, Search, Shield } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { WalletCard } from "@/components/WalletCard";
import { ThriftGroupCard } from "@/components/ThriftGroupCard";
import { UserBadge } from "@/components/UserBadge";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { PendingInvitesNotification } from "@/components/PendingInvitesNotification";
import { useAuth } from "@/contexts/AuthContext";
import { useMyGroups } from "@/hooks/useThriftGroups";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useEffect } from "react";

const quickActions = [
  { label: "Fund Wallet", icon: "💰", link: "/wallet" },
  { label: "New Group", icon: "👥", link: "/create-group" },
  { label: "Groups", icon: "📨", link: "/groups" },
  { label: "Support", icon: "💬", link: "/support/new" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile, wallet, loading: authLoading } = useAuth();
  const { groups, loading: groupsLoading } = useMyGroups();
  const { isAdmin } = useIsAdmin();

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground font-semibold">
                {getInitials(profile?.full_name)}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Welcome back,</p>
                <h2 className="font-semibold text-foreground">
                  {profile?.full_name || user?.email?.split("@")[0] || "User"}
                </h2>
              </div>
              <UserBadge type={profile?.membership_tier || "newbie"} size="sm" />
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} title="Admin Dashboard">
                  <Shield className="h-5 w-5 text-primary" />
                </Button>
              )}
              <PendingInvitesNotification />
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
          balance={Number(wallet?.available_balance) || 0}
          onFund={() => navigate("/wallet")}
          onWithdraw={() => navigate("/wallet")}
        />

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <motion.button
              key={action.label}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => action.link && navigate(action.link)}
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

          {groupsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : groups.length > 0 ? (
            <div className="space-y-4">
              {groups.slice(0, 3).map((group) => (
                <ThriftGroupCard
                  key={group.id}
                  id={group.id}
                  name={group.name}
                  rating={Number(group.rating) || 0}
                  memberCount={group.memberCount}
                  maxMembers={group.max_members}
                  contributionAmount={Number(group.contribution_amount)}
                  period={group.period}
                  isMember={group.isMember}
                  isActive={group.status === "active"}
                  isCompleted={group.status === "completed"}
                  pendingRequests={group.pendingRequests}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>You haven't joined any thrift groups yet.</p>
              <Link to="/create-group">
                <Button variant="link" className="mt-2">
                  Create your first group
                </Button>
              </Link>
            </div>
          )}
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
