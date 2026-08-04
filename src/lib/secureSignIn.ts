import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Signs in through the hardened `secure-login` edge function, which applies
 * server-side brute-force protection (per-email/per-IP failure counting,
 * progressive backoff and temporary lockout) before touching auth, then
 * hydrates the given Supabase client with the returned session.
 */
export async function secureSignIn(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<{ error: Error | null }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secure-login`;

  let payload: { session?: { access_token: string; refresh_token: string }; error?: string };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ email, password }),
    });
    payload = await res.json();
  } catch {
    return { error: new Error("Couldn't reach the sign-in service. Check your connection and try again.") };
  }

  if (!payload?.session) {
    return { error: new Error(payload?.error || "Incorrect email or password.") };
  }

  const { error } = await client.auth.setSession({
    access_token: payload.session.access_token,
    refresh_token: payload.session.refresh_token,
  });

  return { error: error ? new Error(error.message) : null };
}
