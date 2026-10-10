// 6-digit login PIN + biometric device unlock (separate from the 4-digit transaction PIN).
// Authenticated actions: get_status, set_pin, change_pin, disable_pin,
//                        enable_biometric, disable_biometric
// Unauthenticated actions: unlock_pin {email, pin}, unlock_biometric {device_token}
//   -> both mint a fresh session on success.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_LOCK_THRESHOLD = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isWeakPin(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "Login PIN must be exactly 6 digits.";
  if (/^(\d)\1{5}$/.test(pin)) return "PIN cannot be all the same digit.";
  const d = pin.split("").map(Number);
  let asc = true, desc = true;
  for (let i = 1; i < 6; i++) {
    if (d[i] !== d[i - 1] + 1) asc = false;
    if (d[i] !== d[i - 1] - 1) desc = false;
  }
  if (asc || desc) return "PIN cannot be sequential digits.";
  if (["123123", "121212", "112233", "111222", "654321", "123456", "000000", "696969", "101010"].includes(pin)) {
    return "This PIN is too common, please choose another.";
  }
  return null;
}

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

async function mintSession(admin: SupabaseClient, url: string, anon: string, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) return null;
  const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: v, error: vErr } = await anonClient.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (vErr || !v.session) return null;
  return {
    access_token: v.session.access_token,
    refresh_token: v.session.refresh_token,
    expires_in: v.session.expires_in,
    expires_at: v.session.expires_at,
    token_type: v.session.token_type,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const ip = clientIp(req);

    // ---------- Unauthenticated unlock paths ----------
    if (action === "unlock_pin" || action === "unlock_biometric") {
      const since = new Date(Date.now() - IP_WINDOW_MS).toISOString();
      const { count: ipFails } = await admin.from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ip).eq("success", false).gte("created_at", since);
      if ((ipFails ?? 0) >= IP_LOCK_THRESHOLD) {
        return json({ success: false, error: "Too many attempts from this network. Try again later.", is_locked: true });
      }

      if (action === "unlock_biometric") {
        const token = String(body.device_token || "");
        if (token.length < 32) return json({ success: false, error: "Biometric unlock isn't set up on this phone." });
        const hash = await sha256(token);
        const { data: dev } = await admin.from("login_biometric_devices")
          .select("id, user_id, revoked_at").eq("token_hash", hash).maybeSingle();
        if (!dev || dev.revoked_at) {
          await admin.from("login_attempts").insert({ email: "biometric", ip_address: ip, success: false, failure_reason: "biometric_invalid" });
          return json({ success: false, error: "Biometric unlock is no longer valid. Please sign in with your password.", reset: true });
        }
        const { data: u } = await admin.auth.admin.getUserById(dev.user_id);
        const email = u?.user?.email;
        if (!email) return json({ success: false, error: "Account not found.", reset: true });
        const session = await mintSession(admin, URL_, ANON, email);
        if (!session) return json({ success: false, error: "Sign-in is temporarily unavailable. Try again." });
        await admin.from("login_biometric_devices").update({ last_used_at: new Date().toISOString() }).eq("id", dev.id);
        await admin.from("login_attempts").insert({ email, ip_address: ip, success: true });
        return json({ success: true, session });
      }

      // unlock_pin
      const email = String(body.email || "").trim().toLowerCase();
      const pin = String(body.pin || "");
      if (!email || !/^\d{6}$/.test(pin)) return json({ success: false, error: "Enter your 6-digit login PIN." });

      // Find user by email
      const { data: list } = await admin.auth.admin.listUsers();
      const user = list.users.find((u) => u.email?.toLowerCase() === email);
      const { data: row } = user
        ? await admin.from("login_pins").select("*").eq("user_id", user.id).maybeSingle()
        : { data: null };
      if (!user || !row) {
        return json({ success: false, error: "Login PIN isn't set up. Please sign in with your password.", reset: true });
      }
      if (row.locked_until && new Date(row.locked_until) > new Date()) {
        return json({
          success: false, is_locked: true, locked_until: row.locked_until,
          error: `Too many wrong tries. Try again after ${new Date(row.locked_until).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos" })} or use your password.`,
        });
      }
      const ok = bcrypt.compareSync(pin, row.pin_hash);
      if (!ok) {
        const n = (row.failed_attempts || 0) + 1;
        const upd: Record<string, unknown> = { failed_attempts: n, updated_at: new Date().toISOString() };
        let locked = false;
        if (n >= MAX_ATTEMPTS) {
          upd.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
          upd.failed_attempts = 0;
          locked = true;
        }
        await admin.from("login_pins").update(upd).eq("user_id", user.id);
        await admin.from("login_attempts").insert({ email, ip_address: ip, success: false, failure_reason: "login_pin_wrong" });
        if (locked) {
          return json({ success: false, is_locked: true, error: `Too many wrong tries. Login PIN locked for ${LOCKOUT_MINUTES} minutes. Use your password instead.` });
        }
        const left = MAX_ATTEMPTS - n;
        return json({ success: false, attempts_remaining: left, error: `Incorrect PIN. ${left} attempt${left === 1 ? "" : "s"} left.` });
      }
      const session = await mintSession(admin, URL_, ANON, email);
      if (!session) return json({ success: false, error: "Sign-in is temporarily unavailable. Try again." });
      await admin.from("login_pins").update({ failed_attempts: 0, locked_until: null, last_used_at: new Date().toISOString() }).eq("user_id", user.id);
      await admin.from("login_attempts").insert({ email, ip_address: ip, success: true });
      return json({ success: true, session });
    }

    // ---------- Authenticated management ----------
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ success: false, error: "Authentication required" }, 401);
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) return json({ success: false, error: "Authentication required" }, 401);

    switch (action) {
      case "get_status": {
        const { data } = await admin.from("login_pins").select("pin_set_at, locked_until").eq("user_id", user.id).maybeSingle();
        return json({ success: true, has_pin: !!data, pin_set_at: data?.pin_set_at ?? null });
      }
      case "set_pin": {
        const pin = String(body.pin || "");
        const weak = isWeakPin(pin);
        if (weak) return json({ success: false, error: weak });
        const hash = bcrypt.hashSync(pin, bcrypt.genSaltSync(10));
        const { error } = await admin.from("login_pins").upsert({
          user_id: user.id, pin_hash: hash, failed_attempts: 0, locked_until: null,
          pin_set_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        if (error) return json({ success: false, error: "Couldn't save your login PIN. Try again." }, 500);
        return json({ success: true });
      }
      case "change_pin": {
        const cur = String(body.current_pin || "");
        const next = String(body.new_pin || "");
        const weak = isWeakPin(next);
        if (weak) return json({ success: false, error: weak });
        const { data: row } = await admin.from("login_pins").select("*").eq("user_id", user.id).maybeSingle();
        if (!row) return json({ success: false, error: "No login PIN set." });
        if (!bcrypt.compareSync(cur, row.pin_hash)) return json({ success: false, error: "Current PIN is incorrect." });
        await admin.from("login_pins").update({
          pin_hash: bcrypt.hashSync(next, bcrypt.genSaltSync(10)), failed_attempts: 0, locked_until: null,
          pin_set_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
        return json({ success: true });
      }
      case "disable_pin": {
        await admin.from("login_pins").delete().eq("user_id", user.id);
        await admin.from("login_biometric_devices").update({ revoked_at: new Date().toISOString() })
          .eq("user_id", user.id).is("revoked_at", null);
        return json({ success: true });
      }
      case "enable_biometric": {
        const { data: row } = await admin.from("login_pins").select("user_id").eq("user_id", user.id).maybeSingle();
        if (!row) return json({ success: false, error: "Set a login PIN first." });
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const token = Array.from(bytes).map((x) => x.toString(16).padStart(2, "0")).join("");
        const { error } = await admin.from("login_biometric_devices").insert({
          user_id: user.id, token_hash: await sha256(token),
          device_label: String(body.device_label || "").slice(0, 120) || null,
        });
        if (error) return json({ success: false, error: "Couldn't turn on biometric unlock." }, 500);
        return json({ success: true, device_token: token });
      }
      case "disable_biometric": {
        const token = String(body.device_token || "");
        if (token) {
          await admin.from("login_biometric_devices").update({ revoked_at: new Date().toISOString() })
            .eq("user_id", user.id).eq("token_hash", await sha256(token));
        }
        return json({ success: true });
      }
      default:
        return json({ success: false, error: "Invalid action" }, 400);
    }
  } catch (e) {
    console.error("login-pin error:", e);
    return json({ success: false, error: "Something went wrong. Please try again." }, 500);
  }
});
