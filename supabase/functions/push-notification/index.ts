import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Web Push crypto helpers — manual VAPID implementation for Deno
async function generatePushPayload(
  subscription: { endpoint: string; p256dh: string; auth_key: string },
  payload: string,
  vapidSubject: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
) {
  // Use web-push compatible approach via fetch with VAPID headers
  const vapidJwt = await createVapidJwt(
    subscription.endpoint,
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );

  // For simplicity, send unencrypted payload via TTL 0 approach
  // In production, you'd want full RFC 8291 encryption
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${vapidJwt},k=${vapidPublicKey}`,
      "Content-Type": "application/json",
      TTL: "86400",
      Urgency: "high",
    },
    body: payload,
  });

  return response;
}

async function createVapidJwt(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  const header = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: audience,
    exp: expiration,
    sub: subject,
  };

  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import the private key
  const keyData = base64UrlDecode(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${unsignedToken}.${signatureB64}`;
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

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
    const { action, user_id, title, body, url, tag, notification_id } = await req.json();
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

      // Only the platform itself, or the target user (test push to own devices)
      if (!internal) {
        const caller = await callerUserId(req, supabaseAdmin);
        if (!caller || caller !== user_id) return unauthorized();
      }


      // Get user's push subscriptions
      const { data: subscriptions, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", user_id);

      if (error || !subscriptions?.length) {
        return new Response(
          JSON.stringify({ sent: 0, message: "No subscriptions found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
      const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@vestara.app";

      const payload = JSON.stringify({
        title: title || "Vestara",
        body: body || "",
        url: url || "/dashboard",
        tag: tag || "wesave-notification",
        notification_id,
      });

      let sent = 0;
      const expired: string[] = [];
      const dlqRows: Array<Record<string, unknown>> = [];

      for (const sub of subscriptions) {
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

      return new Response(
        JSON.stringify({ sent, expired: expired.length, dlq: dlqRows.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Retry pending DLQ entries (cron). Re-fetches each subscription
    // and re-sends; on success the entry is marked resolved, on failure
    // attempts is incremented.
    if (action === "retry_dlq") {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
      const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@vestara.app";

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
