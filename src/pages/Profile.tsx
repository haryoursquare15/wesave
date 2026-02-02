import { motion } from "framer-motion";
import { Settings, ChevronRight, Shield, CreditCard, Bell, HelpCircle, LogOut, Award } from "lucide-react";
import { Link } from "react-router-dom";
import { UserBadge } from "@/components/UserBadge";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BottomNav } from "@/components/BottomNav";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  { icon: Shield, label: "Security & Privacy", path: "/settings/security" },
  { icon: CreditCard, label: "Payment Methods", path: "/settings/payments" },
  { icon: Bell, label: "Notifications", path: "/settings/notifications" },
  { icon: HelpCircle, label: "Help & Support", path: "/help" },
];

const stats = [
  { label: "Groups Joined", value: "5" },
  { label: "Cycles Completed", value: "12" },
  { label: "Total Saved", value: "₦2.5M" },
];

export default function Profile() {
  const creditScore = 720;
  const maxScore = 850;
  const scorePercentage = (creditScore / maxScore) * 100;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-gradient-to-br from-primary to-primary/80 pb-16 pt-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-lg font-bold text-primary-foreground">Profile</h1>
            <Link to="/settings">
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
          </div>

          {/* Profile Info */}
          <div className="text-center">
            <div className="relative inline-block mb-4">
              <div className="h-24 w-24 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold text-primary-foreground">
                JD
              </div>
              <div className="absolute -bottom-2 -right-2">
                <UserBadge type="silver" size="md" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-primary-foreground mb-1">
              John Doe
            </h2>
            <p className="text-primary-foreground/70 text-sm mb-3">
              @johndoe • Member since Jan 2024
            </p>
            <div className="flex items-center justify-center gap-1">
              <StarRating rating={4.5} size="sm" />
              <span className="text-sm text-primary-foreground/70 ml-1">4.5</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 -mt-10 space-y-6">
        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-lg p-6"
        >
          <div className="grid grid-cols-3 gap-4">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Credit Score */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl border border-border p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Award className="h-5 w-5 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Credit Score</h3>
                <p className="text-xs text-muted-foreground">Based on platform activity</p>
              </div>
            </div>
            <Badge variant="success">Good</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your Score</span>
              <span className="font-bold text-foreground">{creditScore}</span>
            </div>
            <Progress value={scorePercentage} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Poor (300)</span>
              <span>Excellent ({maxScore})</span>
            </div>
          </div>
        </motion.div>

        {/* Badge Progress */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-gold/10 to-gold/5 rounded-2xl border border-gold/20 p-6"
        >
          <div className="flex items-center gap-4">
            <UserBadge type="gold" size="lg" />
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">
                Upgrade to Gold
              </h3>
              <p className="text-xs text-muted-foreground mb-2">
                Complete 2 more cycles to unlock Gold status
              </p>
              <Progress value={60} className="h-2" />
            </div>
          </div>
        </motion.div>

        {/* Menu Items */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-2xl border border-border divide-y divide-border"
        >
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{item.label}</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          ))}
        </motion.div>

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full h-12 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </main>

      <BottomNav />
    </div>
  );
}
