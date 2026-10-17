import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Service-role-only entrypoint; the existing trigger entrypoint retains its internal-token authentication.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  let diff = token.length ^ (key?.length ?? 0);
  for (let i = 0; i < (key?.length ?? 0); i++) diff |= token.charCodeAt(i) ^ (key?.charCodeAt(i) ?? 0);
  if (!key || !url || diff !== 0) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  try {
    const input = await req.json();
    const response = await fetch(`${url}/functions/v1/push-notification`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, action: "send_push" }),
    });
    return new Response(await response.text(), { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch { return Response.json({ error: "Unable to send notification" }, { status: 400, headers: corsHeaders }); }
});