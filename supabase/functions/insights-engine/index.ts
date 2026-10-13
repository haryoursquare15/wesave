// Vestara Insights scoring + insight engine. READ-ONLY with respect to money:
// all maths lives in public.insights_compute_user (SQL, reads insights_* views
// and user_balance_snapshots only). This function only orchestrates.
//
// Paths:
//  - cron:      POST with x-cron-token (internal_cron_tokens name "insights_engine") → all eligible users
//  - on-demand: user JWT → that user only, max one run per 15 minutes (returns cached row otherwise)
//  - dry run:   { dry_run: true, user_id } by admin JWT or cron token → breakdown, writes nothing
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { serviceClient, verifyCronToken, requireAdminJwt } from "../_shared/cron-auth.ts";

const RATE_LIMIT_MS = 15 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Error text only — never balances or PII.
function safeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return msg.replace(/\d{6,}/g, "#").slice(0, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = serviceClient();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const dryRun = body.dry_run === true;
  const targetUser = typeof body.user_id === "string" ? body.user_id : null;
  if (targetUser && !UUID_RE.test(targetUser)) return json({ error: "Invalid user_id" }, 400);

  const isCron = await verifyCronToken(req, "insights_engine", db);

  // ---------- Dry run (admin or service only) ----------
  if (dryRun) {
    if (!isCron && !(await requireAdminJwt(req, db))) return json({ error: "Unauthorized" }, 401);
    if (!targetUser) return json({ error: "user_id is required for dry_run" }, 400);
    const { data, error } = await db.rpc("insights_compute_user", { p_user: targetUser, p_dry_run: true });
    if (error) return json({ error: safeError(error) }, 500);
    return json(data);
  }

  // ---------- On-demand (own data only) ----------
  if (!isCron) {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: claims, error: cErr } = await db.auth.getClaims(auth.slice(7));
    const userId = claims?.claims?.sub as string | undefined;
    if (cErr || !userId) return json({ error: "Unauthorized" }, 401);

    const { data: cached } = await db.from("user_scores").select("*").eq("user_id", userId).maybeSingle();
    if (cached?.computed_at && Date.now() - new Date(cached.computed_at).getTime() < RATE_LIMIT_MS) {
      return json({ cached: true, score: cached });
    }
    const started = Date.now();
    const { data: run } = await db.from("insight_run_logs").insert({ trigger: "on_demand" }).select("run_id").single();
    const { data, error } = await db.rpc("insights_compute_user", { p_user: userId, p_dry_run: false, p_run_id: run?.run_id ?? null });
    await db.from("insight_run_logs").update({
      finished_at: new Date().toISOString(),
      users_processed: error ? 0 : 1,
      users_failed: error ? 1 : 0,
      insights_created: (data as { insights_created?: number } | null)?.insights_created ?? 0,
      error_summary: error ? [{ error: safeError(error) }] : [],
    }).eq("run_id", run?.run_id);
    if (error) return json({ error: "We couldn't refresh your insights right now. Please try again later." }, 500);
    const { data: fresh } = await db.from("user_scores").select("*").eq("user_id", userId).maybeSingle();
    return json({ cached: false, result: data, score: fresh, duration_ms: Date.now() - started });
  }

  // ---------- Cron: all eligible users ----------
  const started = Date.now();
  const { data: run, error: runErr } = await db.from("insight_run_logs").insert({ trigger: "cron" }).select("run_id").single();
  if (runErr) return json({ error: safeError(runErr) }, 500);

  let users: string[] = [];
  if (targetUser) users = [targetUser];
  else {
    const { data: elig, error } = await db.from("insights_eligible_users").select("user_id");
    if (error) {
      await db.from("insight_run_logs").update({ finished_at: new Date().toISOString(), error_summary: [{ error: safeError(error) }] }).eq("run_id", run.run_id);
      return json({ error: safeError(error) }, 500);
    }
    users = (elig ?? []).map((r) => r.user_id as string);
  }

  let processed = 0, failed = 0, insights = 0;
  const errors: { user_ref: string; error: string }[] = [];
  for (const uid of users) {
    const { data, error } = await db.rpc("insights_compute_user", { p_user: uid, p_dry_run: false, p_run_id: run.run_id });
    if (error) {
      failed++;
      if (errors.length < 25) errors.push({ user_ref: uid.slice(0, 8), error: safeError(error) });
    } else {
      processed++;
      insights += (data as { insights_created?: number } | null)?.insights_created ?? 0;
    }
  }

  await db.from("insight_run_logs").update({
    finished_at: new Date().toISOString(),
    users_processed: processed, users_failed: failed, insights_created: insights, error_summary: errors,
  }).eq("run_id", run.run_id);

  console.log(JSON.stringify({ run_id: run.run_id, processed, failed, insights, duration_ms: Date.now() - started }));
  return json({ run_id: run.run_id, users_processed: processed, users_failed: failed, insights_created: insights, duration_ms: Date.now() - started });
});
