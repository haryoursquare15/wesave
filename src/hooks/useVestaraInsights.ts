import { useCallback, useEffect, useState } from "react";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { useSandboxAuth } from "@/contexts/SandboxAuthContext";

export interface MoneyScore {
  score: number; save_score: number; circle_score: number; grow_score: number; pay_score: number;
  level: number; xp: number; previous_score: number | null; computed_at: string;
  details: Record<string, unknown>;
}
export interface ScoreMonth extends MoneyScore { month: string }
export interface MoneyInsight {
  id: string; rule_id: string; type: "warning" | "win" | "tip"; title: string; body: string;
  action_key: string | null; payload: Record<string, unknown>; status: string;
}

/** Uses only the signed-in customer client; financial calculations remain in SQL. */
export function useVestaraInsights() {
  const { user } = useSandboxAuth();
  const [score, setScore] = useState<MoneyScore | null>(null);
  const [history, setHistory] = useState<ScoreMonth[]>([]);
  const [insights, setInsights] = useState<MoneyInsight[]>([]);
  const [streak, setStreak] = useState({ current_weeks: 0, best_weeks: 0 });
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setError(null);
    try {
      const engine = await sandboxSupabase.functions.invoke("insights-engine", { body: {} });
      const results = await Promise.all([
        sandboxSupabase.from("user_scores").select("*").eq("user_id", user.id).maybeSingle(),
        sandboxSupabase.from("user_score_history").select("*").eq("user_id", user.id).order("month", { ascending: false }).limit(6),
        sandboxSupabase.from("user_insights").select("*").eq("user_id", user.id).in("status", ["new", "seen"]).order("created_at", { ascending: false }).limit(12),
        sandboxSupabase.from("user_streaks").select("current_weeks,best_weeks").eq("user_id", user.id).maybeSingle(),
        sandboxSupabase.from("insight_preferences").select("insights_enabled,nudges_enabled").eq("user_id", user.id).maybeSingle(),
      ]);
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
      setScore(results[0].data as unknown as MoneyScore | null);
      setHistory(((results[1].data ?? []) as unknown as ScoreMonth[]).reverse());
      setInsights((results[2].data ?? []) as unknown as MoneyInsight[]);
      setStreak(results[3].data ?? { current_weeks: 0, best_weeks: 0 });
      setEnabled(results[4].data?.insights_enabled !== false);
      if (engine.error) setError("Your last saved insights are shown. Try refreshing again shortly.");
    } catch {
      setError("We couldn't load your Money Pulse. Please try again.");
    } finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => { void refresh(); }, [refresh]);
  const updateInsight = async (id: string, status: "dismissed" | "acted") => {
    if (!user) return false;
    const { error: updateError, data } = await sandboxSupabase.from("user_insights")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("id");
    if (updateError || !data?.length) { setError("That update wasn't saved. Please try again."); return false; }
    setInsights(previous => previous.filter(item => item.id !== id));
    return true;
  };
  return { score, history, insights, streak, enabled, loading, error, refresh, updateInsight };
}