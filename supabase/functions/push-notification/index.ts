import { createClient } from "npm:@supabase/supabase-js@2";

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";
import { sendAndroidPush } from "../_shared/fcm.ts";
import { pushCategoryEnabled } from "../_shared/android-push-policy.ts";

import webpush from "npm:web-push@3.6.7";

// Web Push via the standard web-push library (RFC 8291 payload encryption + VAPID).
function rawVapidPrivateKey(privateKey: string): string {
  const bytes = new Uint8Array(base64UrlDecode(privateKey));
  if (bytes.length === 32) return privateKey;
  // PKCS#8 P-256 key: the 32-byte private scalar follows the 0x04 0x20 marker.
  for (let i = 0; i < bytes.length - 33; i++) {
    if (bytes[i] === 0x04 && bytes[i + 1] === 0x20) {
      const d = bytes.slice(i + 2, i + 34);
      return btoa(String.fromCharCode(...d)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
  }
  return privateKey;
}

async function generatePushPayload(
  subscription: { endpoint: string; p256dh: string; auth_key: string },
  payload: string,
  vapidSubject: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } },
      payload,
      {
        vapidDetails: { subject: vapidSubject, publicKey: vapidPublicKey, privateKey: rawVapidPrivateKey(vapidPrivateKey) },
        TTL: 86400,
        urgency: "high",
      },
    );
    return { ok: true, status: res.statusCode };
  } catch (e: any) {
    if (e?.statusCode) return { ok: false, status: e.statusCode };
    throw e;
  }
}

function base64UrlDecode(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Constant-time comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Notification service is not configured");
  return value;
}

function adminClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

/** Trusted internal caller: DB trigger token, CRON_SECRET, or service role key. */
async function isInternalCaller(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (serviceKey && bearer && safeEqual(bearer, serviceKey)) return true;

  const provided = req.headers.get("x-cron-token") || "";
  if (!provided) return false;

  const envSecret = Deno.env.get("CRON_SECRET");
  if (envSecret && safeEqual(provided, envSecret)) return true;

  const { data } = await supabase
    .from("internal_cron_tokens")
    .select("token")
    .eq("name", "internal_notifications")
    .maybeSingle();

  return !!data?.token && safeEqual(provided, data.token as string);
}

/** Resolve the authenticated user id from the caller's JWT, if any. */
async function callerUserId(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error) return null;
  return (data?.claims?.sub as string) ?? null;
}

/** Only allow relative in-app paths as the notification target. */
function sanitizeUrl(url: unknown): string {
  if (typeof url !== "string") return "/dashboard";
  if (!/^\/[A-Za-z0-9\-_/?=&.]*$/.test(url)) return "/dashboard";
  return url.slice(0, 300);
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const schema = z.object({
      action: z.enum(["get_vapid_key", "send_push", "retry_dlq"]),
      user_id: z.string().uuid().optional(), title: z.string().max(1000).optional(),
      body: z.string().max(10000).optional(), url: z.string().max(2000).optional(),
      tag: z.string().max(200).optional(), notification_id: z.string().uuid().nullish(),
      category: z.string().max(100).optional(),
    });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid notification request" }, { status: 400, headers: corsHeaders });
    const { action, user_id, title, body, url, tag, notification_id, category } = parsed.data;
    const supabaseAdmin = adminClient();
    const internal = await isInternalCaller(req, supabaseAdmin);

    // Return VAPID public key for client subscription (requires a signed-in user)
    if (action === "get_vapid_key") {
      if (!internal && !(await callerUserId(req, supabaseAdmin))) return unauthorized();
      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
      if (!vapidPublicKey) {
        return new Response(
          JSON.stringify({ error: "VAPID not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ vapid_public_key: vapidPublicKey }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send push notification to a user
    if (action === "send_push") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sending is internal-only, except a signed-in user sending to themselves
      // (used by the Profile → Notifications test button).
      if (!internal && (await callerUserId(req, supabaseAdmin)) !== user_id) return unauthorized();

      // Get user's push subscriptions
      const { data: subscriptions, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", user_id);

      if (error) throw new Error("Unable to load notification devices");

      // Respect the user's notification preferences; security alerts always send.
      const cat = typeof category === "string" ? category : "transactions";
      if (cat !== "security") {
        const { data: prefs } = await supabaseAdmin
          .from("notification_preferences")
          .select("transactions, marketing")
          .eq("user_id", user_id)
          .maybeSingle();
        const enabled = pushCategoryEnabled(cat, prefs);
        if (!enabled) {
          return new Response(
            JSON.stringify({ sent: 0, skipped: "category_disabled", web: { sent: 0, failed: 0, removed: 0 }, fcm: { sent: 0, failed: 0, removed: 0 } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
      const vapidSubject = (() => { const v = Deno.env.get("VAPID_SUBJECT") || ""; return /^(mailto:|https?:\/\/)/.test(v) ? v : "mailto:support@vestara.ng"; })();

      const payload = JSON.stringify({
        title: String(title || "Vestara").slice(0, 120),
        body: String(body || "").slice(0, 500),
        url: sanitizeUrl(url),
        tag: String(tag || "vestara-notification").slice(0, 60),
        notification_id,
      });


      let sent = 0;
      const expired: string[] = [];
      const dlqRows: Array<Record<string, unknown>> = [];

      for (const sub of subscriptions ?? []) {
        try {
          const response = await generatePushPayload(
            sub,
            payload,
            vapidSubject,
            vapidPublicKey,
            vapidPrivateKey
          );

          if (response.ok || response.status === 201) {
            sent++;
          } else if (response.status === 404 || response.status === 410) {
            // Subscription expired, clean up
            expired.push(sub.id);
          } else {
            // Persist failure to DLQ for retry instead of silently dropping
            console.error(`Push failed for ${sub.endpoint}: ${response.status}`);
            dlqRows.push({
              user_id,
              notification_id: notification_id ?? null,
              subscription_endpoint: sub.endpoint,
              payload: { title, body, url, tag, notification_id },
              failure_status: response.status,
              failure_reason: `HTTP ${response.status}`,
            });
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`Push error for ${sub.endpoint}:`, reason);
          dlqRows.push({
            user_id,
            notification_id: notification_id ?? null,
            subscription_endpoint: sub.endpoint,
            payload: { title, body, url, tag, notification_id },
            failure_status: 0,
            failure_reason: reason,
          });
        }
      }

      // Clean up expired subscriptions
      if (expired.length > 0) {
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .in("id", expired);
      }

      // Persist failures (best-effort; never block push response)
      if (dlqRows.length > 0) {
        const { error: dlqErr } = await supabaseAdmin
          .from("notification_dlq")
          .insert(dlqRows);
        if (dlqErr) console.error("DLQ insert failed:", dlqErr.message);
      }

      const fcm = await sendAndroidPush(supabaseAdmin, user_id, sanitizeUrl(url), String(tag || "vestara-notification").slice(0, 60));
      return new Response(
        JSON.stringify({ sent, expired: expired.length, dlq: dlqRows.length, web: { sent, failed: dlqRows.length, removed: expired.length }, fcm }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Retry pending DLQ entries (cron). Re-fetches each subscription
    // and re-sends; on success the entry is marked resolved, on failure
    // attempts is incremented.
    if (action === "retry_dlq") {
      if (!internal) return unauthorized();


      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
      const vapidSubject = (() => { const v = Deno.env.get("VAPID_SUBJECT") || ""; return /^(mailto:|https?:\/\/)/.test(v) ? v : "mailto:support@vestara.ng"; })();

      const { data: pending } = await supabaseAdmin
        .from("notification_dlq")
        .select("*")
        .is("resolved_at", null)
        .lt("attempts", 5)
        .lte("next_retry_at", new Date().toISOString())
        .limit(50);

      let resolved = 0;
      let failed = 0;

      for (const entry of pending ?? []) {
        const { data: sub } = await supabaseAdmin
          .from("push_subscriptions")
          .select("*")
          .eq("endpoint", entry.subscription_endpoint)
          .maybeSingle();

        if (!sub) {
          // Subscription no longer exists — mark resolved so we stop retrying.
          await supabaseAdmin
            .from("notification_dlq")
            .update({ resolved_at: new Date().toISOString(), failure_reason: "subscription_gone" })
            .eq("id", entry.id);
          resolved++;
          continue;
        }

        try {
          const response = await generatePushPayload(
            sub,
            JSON.stringify(entry.payload),
            vapidSubject,
            vapidPublicKey,
            vapidPrivateKey
          );
          if (response.ok || response.status === 201) {
            await supabaseAdmin
              .from("notification_dlq")
              .update({ resolved_at: new Date().toISOString() })
              .eq("id", entry.id);
            resolved++;
          } else {
            await supabaseAdmin
              .from("notification_dlq")
              .update({
                attempts: entry.attempts + 1,
                next_retry_at: new Date(Date.now() + Math.min(60, entry.attempts * 15) * 60 * 1000).toISOString(),
                failure_status: response.status,
                failure_reason: `HTTP ${response.status}`,
              })
              .eq("id", entry.id);
            failed++;
          }
        } catch (err) {
          await supabaseAdmin
            .from("notification_dlq")
            .update({
              attempts: entry.attempts + 1,
              next_retry_at: new Date(Date.now() + Math.min(60, entry.attempts * 15) * 60 * 1000).toISOString(),
              failure_reason: err instanceof Error ? err.message : String(err),
            })
            .eq("id", entry.id);
          failed++;
        }
      }

      return new Response(
        JSON.stringify({ checked: pending?.length ?? 0, resolved, failed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Push notification error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
