import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendBrandedEmail } from "../_shared/send-branded-email.ts";

/**
 * Ledger integrity monitor.
 *
 * Runs `vestara_detect_balance_drift()` and, if ANY account's balance disagrees
 * with its ledger history — or any customer's displayed balance disagrees with
 * their ledger wallet — raises an alert to every platform admin (in-app
 * notification + email) rather than only writing a log line.
 *
 * Silent when clean.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function db() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function authorized(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-cron-token") || "";
  if (!provided) return false;
  const { data } = await db().from("internal_cron_tokens")
    .select("token").eq("name", "drift_monitor").maybeSingle();
  return !!data?.token && data.token === provided;
}

// Email clients frequently lack a glyph for "₦" and render it struck through,
// so money in outbound email/notification copy uses the "NGN" ISO code instead.
function money(n: number) {
  return `NGN ${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function alertAdmins(findings: Array<Record<string, unknown>>) {
  const supabase = db();

  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["super_admin", "admin", "finance_admin"]);

  const adminIds = Array.from(new Set((admins || []).map((a) => a.user_id as string)));
  if (adminIds.length === 0) {
    console.error("[drift-monitor] DRIFT DETECTED but no admins to alert:", findings.length);
    return;
  }

  const lines = findings.slice(0, 10).map((f) =>
    `• ${f.kind} — account ${String(f.account_id).slice(0, 8)}… expected ${money(Number(f.expected))}, actual ${money(Number(f.actual))} (off by ${money(Number(f.delta))})`
  ).join("\n");

  const title = `Ledger drift detected (${findings.length})`;
  const body =
    `${findings.length} account${findings.length === 1 ? "" : "s"} no longer match the ledger.\n\n${lines}` +
    (findings.length > 10 ? `\n…and ${findings.length - 10} more.` : "") +
    `\n\nInvestigate immediately — customer balances may be wrong.`;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", adminIds);

  for (const adminId of adminIds) {
    try {
      await supabase.rpc("insert_user_notification", {
        _user_id: adminId,
        _title: title,
        _message: body,
        _notification_type: "ledger_drift",
      });
    } catch (e) {
      console.error("[drift-monitor] in-app alert failed:", e);
    }
  }

  for (const p of profiles || []) {
    if (!p.email) continue;
    try {
      await sendBrandedEmail({
        recipientEmail: p.email as string,
        recipientName: (p.full_name as string) || undefined,
        title,
        message: body,
        actionUrl: "https://vestara.ng/vst-ops-9f3c",
        actionLabel: "Open Admin Portal",
        signOff: "Please action this before the next reconciliation window.",
      });
    } catch (e) {
      console.error("[drift-monitor] email alert failed:", e);
    }
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!(await authorized(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = db();
    const { data, error } = await supabase.rpc("vestara_detect_balance_drift");
    if (error) throw error;

    const result = data as { checked_at: string; findings: number };

    if (result.findings > 0) {
      const { data: open } = await supabase
        .from("ledger_drift_findings")
        .select("kind, account_id, user_id, account_type, expected, actual, delta")
        .is("resolved_at", null)
        .order("detected_at", { ascending: false });

      console.error("[drift-monitor] DRIFT DETECTED:", JSON.stringify(open));
      await alertAdmins(open || []);
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[drift-monitor] failed:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
