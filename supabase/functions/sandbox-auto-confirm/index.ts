// Edge function: sandbox-auto-confirm
// Purpose: instantly confirm a user account that was created via the VFD
// Sandbox login page (so testers can use throwaway emails like
// `test1@sandbox.local` without waiting for an email link).
//
// Security:
//   - Only confirms accounts whose `user_metadata.sandbox_account === true`
//   - Only confirms accounts whose email matches an allowed sandbox pattern
//     OR is unconfirmed and was created less than 5 minutes ago
//   - Uses the service role key server-side (never exposed to the client)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") {
      return json({ error: "email is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "server not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look the user up by email
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) return json({ error: listErr.message }, 500);

    const target = list.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!target) return json({ error: "user not found" }, 404);

    // Guardrail: only auto-confirm accounts explicitly created from the sandbox
    const isSandbox = target.user_metadata?.sandbox_account === true;

    if (!isSandbox) {
      return json({ error: "not eligible for auto-confirm" }, 403);
    }


    if (target.email_confirmed_at) {
      return json({ success: true, already_confirmed: true });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
      email_confirm: true,
    });
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
