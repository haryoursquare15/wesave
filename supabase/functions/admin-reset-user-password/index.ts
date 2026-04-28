import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify super_admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden: super_admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const { target_user_id, target_email, mode, new_password } = body as {
      target_user_id?: string;
      target_email?: string;
      mode: "set_temp_password" | "send_recovery_link";
      new_password?: string;
    };

    if (!target_user_id && !target_email) {
      return json({ error: "target_user_id or target_email required" }, 400);
    }

    // Resolve target user
    let targetId = target_user_id;
    let targetEmail = target_email;
    if (!targetId && targetEmail) {
      const { data: prof } = await admin
        .from("profiles")
        .select("id, email")
        .eq("email", targetEmail)
        .maybeSingle();
      if (!prof) return json({ error: "User not found" }, 404);
      targetId = prof.id;
    } else if (targetId && !targetEmail) {
      const { data: prof } = await admin
        .from("profiles")
        .select("email")
        .eq("id", targetId)
        .maybeSingle();
      targetEmail = prof?.email ?? undefined;
    }

    if (mode === "set_temp_password") {
      if (!new_password || new_password.length < 8) {
        return json({ error: "new_password must be at least 8 characters" }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(targetId!, {
        password: new_password,
      });
      if (error) return json({ error: error.message }, 400);

      await admin.from("audit_logs").insert({
        user_id: userData.user.id,
        action: "admin_set_temp_password",
        resource_type: "user",
        resource_id: targetId,
        details: { target_email: targetEmail },
      });

      return json({ ok: true, message: "Temporary password set" });
    }

    if (mode === "send_recovery_link") {
      if (!targetEmail) return json({ error: "Email not found for user" }, 400);
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: { redirectTo: `${new URL(req.url).origin.replace("supabase.co", "lovable.app")}/reset-password` },
      });
      if (error) return json({ error: error.message }, 400);

      await admin.from("audit_logs").insert({
        user_id: userData.user.id,
        action: "admin_generate_recovery_link",
        resource_type: "user",
        resource_id: targetId,
        details: { target_email: targetEmail },
      });

      return json({ ok: true, action_link: data.properties?.action_link });
    }

    return json({ error: "Invalid mode" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
