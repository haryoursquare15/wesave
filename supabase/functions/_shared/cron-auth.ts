// Shared caller verification for non-interactive (cron / service-to-service)
// edge function invocations.
//
// A caller is authorised when it presents an `x-cron-token` header matching
// EITHER the CRON_SECRET environment variable OR the named row in
// `internal_cron_tokens` (the pattern already used by vestara-drift-monitor
// and the bills reconciler, so pg_cron can hold the value without needing
// access to edge function env vars).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Constant-time string comparison to avoid leaking the token via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/**
 * Verify the `x-cron-token` header. Returns false when the header is absent
 * or does not match any configured secret.
 */
export async function verifyCronToken(
  req: Request,
  tokenName: string,
  supabase?: SupabaseClient,
): Promise<boolean> {
  const provided = req.headers.get("x-cron-token") || "";
  if (!provided) return false;

  const envSecret = Deno.env.get("CRON_SECRET");
  if (envSecret && timingSafeEqual(provided, envSecret)) return true;

  const db = supabase ?? serviceClient();
  const { data } = await db
    .from("internal_cron_tokens")
    .select("token")
    .eq("name", tokenName)
    .maybeSingle();

  return !!data?.token && timingSafeEqual(provided, data.token as string);
}

export function unauthorized(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Resolve the caller's user id from their JWT and confirm they hold an
 * administrative role. Returns null when unauthenticated or not an admin.
 */
export async function requireAdminJwt(
  req: Request,
  supabase?: SupabaseClient,
): Promise<{ userId: string; role: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const db = supabase ?? serviceClient();

  const { data: claimsData, error } = await db.auth.getClaims(token);
  const userId = claimsData?.claims?.sub as string | undefined;
  if (error || !userId) return null;

  const { data: roles } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin"]);

  if (!roles || roles.length === 0) return null;
  return { userId, role: roles[0].role as string };
}
