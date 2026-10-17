// Email OTP for sandbox sign-up.
// Flow:
//   action=send              -> emails a 6-digit code to the address.
//   action=verify_and_create -> on correct code, creates the auth user with
//                               email_confirm=true and returns a session.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { sendBrandedEmail } from "../_shared/send-branded-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function genCode(): string {
  const n = (crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000);
  return n.toString().padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    if (action === "send") {
      // Block if an unconfirmed account for this email already exists? We still
      // allow — the user may be re-trying. But if a CONFIRMED account exists,
      // steer them to sign in instead of silently creating noise.
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email?.toLowerCase() === email);
      if (existing?.email_confirmed_at) {
        return json({ error: "An account with this email already exists. Please sign in." }, 409);
      }

      // Cooldown
      const { data: prev } = await admin
        .from("signup_email_otps")
        .select("created_at")
        .eq("email", email)
        .maybeSingle();
      if (prev && Date.now() - Date.parse(prev.created_at) < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - Date.parse(prev.created_at))) / 1000);
        return json({ error: `Please wait ${wait}s before requesting another code.` }, 429);
      }

      const code = genCode();
      const code_hash = bcrypt.hashSync(code, bcrypt.genSaltSync(10));
      const expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString();

      const { error: upErr } = await admin
        .from("signup_email_otps")
        .upsert({ email, code_hash, attempts: 0, expires_at, created_at: new Date().toISOString() });
      if (upErr) {
        console.error("otp upsert error:", upErr);
        return json({ error: "Could not start verification. Please try again." }, 500);
      }

      const sent = await sendBrandedEmail({
        recipientEmail: email,
        title: "Verify your email",
        message:
          `Use the code below to finish creating your Vestara account. ` +
          `This code expires in 15 minutes. If you didn't request this, ignore this email.`,
        highlightLabel: "Your 6-digit code",
        highlightValue: code,
        securityNotice: true,
        idempotencyKey: `signup-otp-${email}-${Date.now()}`,
      });

      if (!sent.ok) {
        // Clear the stored code so the user can retry immediately once sending works.
        await admin.from("signup_email_otps").delete().eq("email", email);
        return json({ error: "We couldn't send your code right now. Please try again in a few minutes." }, 503);
      }

      return json({ success: true });
    }

    if (action === "verify_and_create") {
      const code = String(body.code || "").trim();
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      const phone = String(body.phone || "").trim();
      if (!/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code from the email." }, 400);
      if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

      const { data: row } = await admin
        .from("signup_email_otps")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      if (!row) return json({ error: "No active code. Please request a new one." }, 400);
      if (new Date(row.expires_at) < new Date()) {
        await admin.from("signup_email_otps").delete().eq("email", email);
        return json({ error: "This code has expired. Please request a new one." }, 400);
      }
      if (row.attempts >= MAX_ATTEMPTS) {
        await admin.from("signup_email_otps").delete().eq("email", email);
        return json({ error: "Too many wrong attempts. Please request a new code." }, 429);
      }

      const ok = bcrypt.compareSync(code, row.code_hash);
      if (!ok) {
        await admin
          .from("signup_email_otps")
          .update({ attempts: row.attempts + 1 })
          .eq("email", email);
        return json({
          error: "Code is incorrect.",
          attempts_remaining: Math.max(MAX_ATTEMPTS - (row.attempts + 1), 0),
        }, 400);
      }

      // Create the auth user (confirmed) and sign them in.
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email?.toLowerCase() === email);
      let userId = existing?.id;
      if (existing) {
        if (existing.email_confirmed_at) {
          return json({ error: "An account with this email already exists. Please sign in." }, 409);
        }
        // Previous unconfirmed signup — update password and confirm.
        const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          user_metadata: { sandbox_account: true, full_name: fullName, phone, email_verified: true },
        });
        if (updErr) return json({ error: updErr.message || "Could not finish sign-up." }, 500);
      } else {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { sandbox_account: true, full_name: fullName, phone, email_verified: true },
        });
        if (createErr || !created.user) {
          return json({ error: createErr?.message || "Could not create your account." }, 500);
        }
        userId = created.user.id;
      }

      await admin.from("signup_email_otps").delete().eq("email", email);

      // Mint a session via password grant.
      const authClient = createClient(SUPABASE_URL, ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: s, error: signErr } = await authClient.auth.signInWithPassword({ email, password });
      if (signErr || !s.session) {
        return json({ error: "Account created. Please sign in." }, 500);
      }

      return json({
        success: true,
        user: { id: userId, email },
        session: {
          access_token: s.session.access_token,
          refresh_token: s.session.refresh_token,
          expires_in: s.session.expires_in,
          expires_at: s.session.expires_at,
          token_type: s.session.token_type,
        },
      });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    console.error("sandbox-signup-otp error:", e);
    return json({ error: (e as Error).message || "Signup failed." }, 500);
  }
});
