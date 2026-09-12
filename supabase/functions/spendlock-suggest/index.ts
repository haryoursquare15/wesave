// SpendLock AI suggestion layer (Layer 2).
// Read-only: turns aggregated numbers from Layer 1 detection into ONE suggestion
// the user can accept or dismiss. Never writes budget rules, never moves money,
// and never sends narrations/counterparty names to the model.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Insights = {
  stats?: { avg_weekly_spend?: number; spend_volatility?: string; debit_count_90d?: number };
  bills?: Array<{ label?: string; amount_estimate?: number; cadence?: string; next_expected_date?: string; status?: string }>;
  income?: Array<{ amount?: number; cadence?: string; confidence?: number }>;
  budget_history?: { periods_closed?: number; weeks_over_limit?: number; unlock_count?: number };
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestion_type", "period_type", "suggested_limit", "headline", "reasoning"],
  properties: {
    suggestion_type: { enum: ["set_limit", "adjust_limit"] },
    period_type: { enum: ["daily", "weekly", "monthly"] },
    suggested_limit: { type: "number" },
    headline: { type: "string" },
    reasoning: { type: "string" },
  },
};

async function askModel(payload: Record<string, unknown>) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      instructions:
        "You are a Nigerian personal-finance assistant for the Vestara app. " +
        "Given aggregated spending numbers (Naira), propose ONE voluntary spending limit " +
        "the customer can accept. Be conservative: the limit should be achievable, " +
        "slightly below recent average spend when the customer overspends, and must leave " +
        "room for known upcoming bills. Keep headline under 60 characters and reasoning " +
        "to one plain sentence with no jargon.",
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] }],
      text: { format: { type: "json_schema", name: "spendlock_suggestion", strict: true, schema: SCHEMA } },
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    return { error: { status: res.status, body } };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const evt = JSON.parse(raw);
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") text += evt.delta;
        if (evt.type === "response.completed" && !text && evt.response?.output_text) {
          text = Array.isArray(evt.response.output_text)
            ? evt.response.output_text.join("")
            : String(evt.response.output_text);
        }
      } catch { /* partial frame */ }
    }
  }
  return { text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Not authenticated" }, 401);

    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const { data: insightsRaw, error: insightsErr } = await supabase.rpc("spendlock_get_insights");
    if (insightsErr) return json({ error: insightsErr.message }, 400);
    const insights = (insightsRaw || {}) as Insights;

    const today = new Date();
    const bills = (insights.bills || [])
      .filter((b) => b.status !== "dismissed")
      .slice(0, 6)
      .map((b) => ({
        amount: Number(b.amount_estimate || 0),
        cadence: b.cadence || "irregular",
        due_in_days: b.next_expected_date
          ? Math.round((new Date(b.next_expected_date).getTime() - today.getTime()) / 86400000)
          : null,
      }));
    const topIncome = (insights.income || []).slice().sort((a, b) => Number(b.amount) - Number(a.amount))[0];

    // Numbers only — no narrations, no counterparty names, no account numbers.
    const payload = {
      currency: "NGN",
      avg_weekly_spend: Number(insights.stats?.avg_weekly_spend || 0),
      spend_volatility: insights.stats?.spend_volatility || "low",
      debit_count_90d: Number(insights.stats?.debit_count_90d || 0),
      detected_bills: bills,
      income_amount: topIncome ? Number(topIncome.amount || 0) : null,
      income_cadence: topIncome?.cadence || null,
      budget_history: {
        periods_closed: Number(insights.budget_history?.periods_closed || 0),
        weeks_over_limit: Number(insights.budget_history?.weeks_over_limit || 0),
        unlock_frequency: Number(insights.budget_history?.unlock_count || 0),
      },
    };

    if (!payload.avg_weekly_spend && !bills.length) {
      return json({ suggestion: null, reason: "not_enough_history" });
    }

    const result = await askModel(payload);
    if ("error" in result) {
      const status = result.error.status;
      const message =
        status === 402
          ? "AI credits are exhausted. Top up in Lovable to get spending suggestions."
          : status === 429
          ? "Too many requests right now. Please try again shortly."
          : "Suggestions are temporarily unavailable.";
      console.error("[spendlock-suggest] gateway error", status, result.error.body?.slice(0, 400));
      return json({ error: message }, status === 429 || status >= 500 ? 503 : status);
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(result.text.trim());
    } catch {
      console.error("[spendlock-suggest] unparseable model output", result.text.slice(0, 300));
      return json({ error: "Suggestions are temporarily unavailable." }, 503);
    }

    const suggestedLimit = Math.max(0, Math.round(Number(parsed?.suggested_limit || 0)));
    if (!suggestedLimit) return json({ suggestion: null, reason: "no_suggestion" });

    const type = parsed?.suggestion_type === "adjust_limit" ? "adjust_limit" : "set_limit";

    // Only one pending suggestion of a type at a time.
    await supabase
      .from("budget_suggestions")
      .update({ status: "dismissed" })
      .eq("user_id", user.id)
      .eq("suggestion_type", type)
      .eq("status", "pending");

    const { data: inserted, error: insertErr } = await supabase
      .from("budget_suggestions")
      .insert({
        user_id: user.id,
        suggestion_type: type,
        payload: {
          period_type: parsed?.period_type || "weekly",
          suggested_limit: suggestedLimit,
          headline: String(parsed?.headline || "A limit that fits your spending"),
          reasoning: String(parsed?.reasoning || ""),
          based_on: payload,
        },
      })
      .select()
      .single();

    if (insertErr) return json({ error: insertErr.message }, 400);
    return json({ suggestion: inserted });
  } catch (e) {
    console.error("[spendlock-suggest] unhandled", e);
    return json({ error: "Suggestions are temporarily unavailable." }, 500);
  }
});
