import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Sparkles, Filter } from "lucide-react";
import { ActivityTicker } from "./ActivityTicker";
import { SimulatedPoolCard } from "./SimulatedPoolCard";
import { SIMULATED_GROUPS, type SimulatedGroup } from "@/lib/simulatedPoolData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

type FilterStatus = "all" | "active" | "almost_full" | "upcoming" | "full" | "completed";

export function PoolSimulation() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<FilterStatus>("all");

  // Determine user badge from credit score
  const userBadge = useMemo(() => {
    const score = profile?.credit_score ?? 0;
    if (score >= 900) return "platinum";
    if (score >= 750) return "gold";
    if (score >= 500) return "silver";
    return "bronze";
  }, [profile?.credit_score]);

  const filtered = useMemo(() => {
    if (filter === "all") return SIMULATED_GROUPS;
    return SIMULATED_GROUPS.filter((g) => g.status === filter);
  }, [filter]);

  const filters: { value: FilterStatus; label: string; count: number }[] = [
    { value: "all", label: "All", count: SIMULATED_GROUPS.length },
    { value: "active", label: "Active", count: SIMULATED_GROUPS.filter((g) => g.status === "active").length },
    { value: "almost_full", label: "Almost Full", count: SIMULATED_GROUPS.filter((g) => g.status === "almost_full").length },
    { value: "upcoming", label: "Upcoming", count: SIMULATED_GROUPS.filter((g) => g.status === "upcoming").length },
  ];

  return (
    <div className="space-y-5">
      {/* Social proof stat */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <Sparkles className="h-4 w-4 text-warning" />
        <span>
          Over <span className="font-semibold text-foreground">200+</span> thrift cycles completed this month.
        </span>
      </motion.div>

      {/* Activity ticker */}
      <ActivityTicker />

      {/* Info banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-xl bg-primary/5 border border-primary/20"
      >
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Earn the required badge to join groups from the pool
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your current badge: <span className="font-medium capitalize text-foreground">{userBadge}</span>
            </p>
          </div>
        </div>
      </motion.div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {filters.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            onClick={() => setFilter(f.value)}
            className="text-xs h-7 gap-1.5 flex-shrink-0"
          >
            {f.label}
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-0.5">
              {f.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Grid of simulated cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map((group, i) => (
          <SimulatedPoolCard
            key={group.id}
            group={group}
            userBadge={userBadge}
            index={i}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No groups match this filter.
        </div>
      )}
    </div>
  );
}
