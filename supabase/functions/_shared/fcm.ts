import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";
import { androidPushData, isInvalidFcmToken } from "./android-push-policy.ts";

let cached: { accessToken: string; expiresAt: number; projectId: string } | undefined;
let pendingAuth: Promise<{ accessToken: string; expiresAt: number; projectId: string }> | undefined;

async function authenticate() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;
  if (pendingAuth) return pendingAuth;
  pendingAuth = (async () => {
    const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
    if (!raw) throw new Error("Android push is not configured");
    const account = JSON.parse(raw);
    if (typeof account.project_id !== "string" || !/^[a-z0-9-]+$/.test(account.project_id) || typeof account.client_email !== "string" || typeof account.private_key !== "string") {
      throw new Error("Android push credentials are invalid");
    }
    const key = await importPKCS8(account.private_key, "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256" }).setIssuer(account.client_email)
      .setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h").sign(key);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Android push authorization failed (${response.status})`);
    const data = await response.json();
    if (typeof data.access_token !== "string") throw new Error("Android push authorization failed");
    cached = { accessToken: data.access_token, projectId: account.project_id, expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
    return cached;
  })();
  try { return await pendingAuth; } finally { pendingAuth = undefined; }
}

export async function sendAndroidPush(client: SupabaseClient, userId: string, url: string, tag: string) {
  const counts = { sent: 0, failed: 0, removed: 0 };
  const { data: devices, error } = await client.from("device_tokens").select("id,token").eq("user_id", userId);
  if (error) throw new Error("Unable to load Android notification devices");
  if (!devices?.length) return counts;
  try {
    const auth = await authenticate();
    for (const device of devices) {
      try {
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { token: device.token, notification: { title: data.title, body: data.body }, data, android: { priority: "high" } } }),
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) { counts.sent++; continue; }
        const body = await response.json().catch(() => null);
        if (isInvalidFcmToken(response.status, body)) {
          const { error: deleteError } = await client.from("device_tokens").delete().eq("id", device.id).eq("user_id", userId);
          if (deleteError) counts.failed++; else counts.removed++;
        } else {
          if (response.status === 401) cached = undefined;
          console.error("FCM delivery failed", { status: response.status, code: body?.error?.status });
          counts.failed++;
        }
      } catch { counts.failed++; console.error("FCM delivery unavailable"); }
    }
  } catch { counts.failed = devices.length; console.error("FCM authorization unavailable; check service account configuration"); }
  return counts;
}