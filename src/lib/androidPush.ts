import type { SupabaseClient } from "@supabase/supabase-js";

export interface VestaraAndroidBridge {
  requestPushPermission(): void | Promise<void>;
  getFcmToken(): string | Promise<string>;
}

declare global {
  interface Window { VestaraAndroid?: VestaraAndroidBridge }
}

export function isAndroidApp(): boolean {
  return typeof window !== "undefined" && navigator.userAgent.includes("VestaraApp") && !!window.VestaraAndroid;
}

export async function readAndroidToken(): Promise<string | null> {
  if (!isAndroidApp()) return null;
  try {
    const token = await window.VestaraAndroid?.getFcmToken();
    return typeof token === "string" && token.trim() ? token.trim() : null;
  } catch { return null; }
}

export async function requestAndroidToken(): Promise<string | null> {
  if (!isAndroidApp()) return null;
  try {
    await window.VestaraAndroid?.requestPushPermission();
    const deadline = Date.now() + 10_000;
    do {
      const token = await readAndroidToken();
      if (token) return token;
      if (Date.now() >= deadline) return null;
      await new Promise((resolve) => setTimeout(resolve, Math.min(500, deadline - Date.now())));
    } while (Date.now() <= deadline);
  } catch { /* Missing or unavailable bridge must not interrupt the app. */ }
  return null;
}

export async function syncAndroidToken(client: SupabaseClient, userId: string, request = false): Promise<boolean> {
  const token = request ? await requestAndroidToken() : await readAndroidToken();
  if (!token) return false;
  try {
    const { error } = await client.from("device_tokens").upsert(
      { user_id: userId, token, platform: "android", last_seen: new Date().toISOString() },
      { onConflict: "token" },
    );
    return !error;
  } catch { return false; }
}

export async function removeAndroidToken(client: SupabaseClient, userId: string): Promise<void> {
  const token = await readAndroidToken();
  if (!token) return;
  try { await client.from("device_tokens").delete().eq("user_id", userId).eq("token", token); }
  catch { /* Best-effort sign-out cleanup. */ }
}