// Hardened sign-in gate.
// Adds server-side brute-force protection in front of GoTrue's password grant:
//  - per-email and per-IP failure counting (public.login_attempts)
//  - progressive backoff, then temporary lockout
//  - every attempt (success or failure) is recorded for audit
// Returns the normal Supabase session on success so the client can setSession().
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WINDOW_MS = 15 * 60 * 1000;
const EMAIL_LOCK_THRESHOLD = 5; // failures per email in window -> lockout
const IP_LOCK_THRESHOLD = 20; // failures per IP in window -> lockout
const LOCKOUT_MS = 15 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Only these auth errors mean the credentials were actually wrong.
function isCredentialError(error: { status?: number; code?: string; message?: string }) {
  const status = error.status ?? 0;
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();
  if (status >= 500 || status === 0) return false;
  if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("timeout")) return false;
  return (
    status === 400 ||
    status === 401 ||
    code.includes("invalid_credentials") ||
    code.includes("email_not_confirmed") ||
    msg.includes("invalid login credentials") ||
    msg.includes("email not confirmed")
  );
}

function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

// Progressive backoff before the 5th failure: 0s, 1s, 2s, 4s, 8s
function backoffMs(failures: number) {
  if (failures <= 0) return 0;
  return Math.min(2 ** (failures - 1) * 1000, 8000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String((body as { email?: string }).email ?? "").trim().toLowerCase();
    const password = String((body as { password?: string }).password ?? "");
    const deviceFingerprint = (body as { device_fingerprint?: string }).device_fingerprint ?? null;
    const ip = clientIp(req);

    if (!email || !password) {
      return json({ error: "Enter your email and password to continue." }, 400);
    }

    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    const [{ count: emailFailures }, { count: ipFailures }] = await Promise.all([
      db.from("login_attempts").select("*", { count: "exact", head: true })
        .eq("email", email).eq("success", false).gte("created_at", since),
      db.from("login_attempts").select("*", { count: "exact", head: true })
        .eq("ip_address", ip).eq("success", false).gte("created_at", since),
    ]);

    const eFail = emailFailures ?? 0;
    const iFail = ipFailures ?? 0;

    if (eFail >= EMAIL_LOCK_THRESHOLD || iFail >= IP_LOCK_THRESHOLD) {
      await db.from("login_attempts").insert({
        email, ip_address: ip, device_fingerprint: deviceFingerprint,
        success: false, failure_reason: "locked_out",
      });
      const minutes = Math.ceil(LOCKOUT_MS / 60000);
      return json({
        error: `Too many failed sign-in attempts. Try again in about ${minutes} minutes, or reset your password.`,
        locked: true,
        retry_after_seconds: Math.ceil(LOCKOUT_MS / 1000),
      }, 429);
    }

    // Slow down repeat guessing before the lockout kicks in.
    const delay = backoffMs(eFail);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    const authClient = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    // Distinguish genuine bad credentials from backend/service problems.
    // A service outage must NOT be reported as "Incorrect email or password"
    // and must NOT count against the user's lockout budget.
    if (error && !isCredentialError(error)) {
      return json({
        error: "Sign-in is temporarily unavailable. Please try again in a moment.",
        transient: true,
      }, 503);
    }

    if (error || !data.session) {
      await db.from("login_attempts").insert({
        email, ip_address: ip, device_fingerprint: deviceFingerprint,
        success: false, failure_reason: error?.message ?? "invalid_credentials",
      });

      const remaining = Math.max(EMAIL_LOCK_THRESHOLD - (eFail + 1), 0);

      // Alert trail once an account is under sustained attack.
      if (eFail + 1 >= EMAIL_LOCK_THRESHOLD) {
        await db.from("audit_logs").insert({
          action: "login_lockout_triggered",
          resource_type: "auth",
          details: { email, ip_address: ip, failures: eFail + 1 },
        }).then(() => {}, () => {});
      }

      return json({
        // Never disclose whether the email exists.
        error: "Incorrect email or password.",
        attempts_remaining: remaining,
      }, 401);
    }

    await db.from("login_attempts").insert({
      email, ip_address: ip, device_fingerprint: deviceFingerprint, success: true,
    });

    return json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
      user: { id: data.user?.id, email: data.user?.email },
    });
  } catch (e) {
    return json({ error: (e as Error).message || "Sign-in failed. Please try again." }, 500);
  }
});
