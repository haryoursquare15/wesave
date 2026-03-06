import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Target, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useTargetAjoGroups } from "@/hooks/useTargetAjo";

export default function TargetAjo() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { groups, myGroups, loading } = useTargetAjoGroups();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"discover" | "mine">("discover");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  const displayed = tab === "mine" ? myGroups : groups;
  const filtered = displayed.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-24 safe-bottom">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold text-foreground">Target Ajo</h1>
            </div>
            <Link to="/target-ajo/create">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Create
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2">
          <Button
            variant={tab === "discover" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("discover")}
          >
            Discover
          </Button>
          <Button
            variant={tab === "mine" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("mine")}
          >
            My Targets
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search targets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>{tab === "mine" ? "You haven't joined any targets yet." : "No targets found."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((g) => {
              const progress = g.target_amount > 0 ? (g.amount_raised / g.target_amount) * 100 : 0;
              return (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate(`/target-ajo/${g.id}`)}
                  className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-foreground">{g.name}</h3>
                      {g.reason && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{g.reason}</p>
                      )}
                    </div>
                    <Badge variant={g.status === "active" ? "default" : "secondary"}>
                      {g.status}
                    </Badge>
                  </div>
                  <Progress value={Math.min(progress, 100)} className="h-2 mb-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>₦{fmt(g.amount_raised)} / ₦{fmt(g.target_amount)}</span>
                    <span>{g.member_count} members • {g.frequency}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
