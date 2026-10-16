import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const expired = () => ({ data: null, error: new Error("Your session has expired. Please sign in again.") });

/** Authenticate security calls explicitly; retry only a rejected authentication, never a network failure. */
export async function invokeSecurityControls(client: SupabaseClient<Database>, options: { body: Record<string, unknown> }) {
  const endSession = async () => {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return expired();
  };
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) return endSession();
    let session = data.session;
    if (!session.expires_at || session.expires_at * 1000 <= Date.now() + 60_000) {
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) return endSession();
      session = refreshed.data.session;
    }
    const call = (token: string) => client.functions.invoke("security-controls", {
      ...options, headers: { Authorization: `Bearer ${token}` },
    });
    const result = await call(session.access_token);
    if (result.error?.context?.status !== 401 && result.data?.code !== "SESSION_EXPIRED") return result;
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) return endSession();
    const retry = await call(refreshed.data.session.access_token);
    if (retry.error?.context?.status === 401 || retry.data?.code === "SESSION_EXPIRED") return endSession();
    return retry;
  } catch {
    return { data: null, error: new Error("We couldn't check your account security. Please try again.") };
  }
}