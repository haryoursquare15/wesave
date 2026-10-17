import { useState, useEffect, useCallback } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isIosBrowserTab(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function detectPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
  if (/android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

export function usePushNotifications() {
  const { session, client: supabase } = useSandboxAwareAuth();
  const user = session?.user ?? null;
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);

  const checkExistingSubscription = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!registration) { setIsSubscribed(false); return; }
      const sub = await registration.pushManager.getSubscription();
      if (!sub || !user || Notification.permission !== "granted") { setIsSubscribed(false); return; }
      // If the VAPID key pair changed since this device subscribed, the old
      // subscription can't receive pushes — drop it and ask to re-subscribe.
      const knownKey = localStorage.getItem("vapid_public_key");
      if (knownKey) {
        try {
          const { data } = await supabase.functions.invoke("push-notification", { body: { action: "get_vapid_key" } });
          if (data?.vapid_public_key && data.vapid_public_key !== knownKey) {
            await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", sub.endpoint);
            await sub.unsubscribe();
            setIsSubscribed(false);
            return;
          }
        } catch { /* best-effort; keep current state on failure */ }
      }
      // Self-heal: make sure the server knows about this phone's subscription.
      const j = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        { user_id: user.id, endpoint: j.endpoint!, p256dh: j.keys!.p256dh!, auth_key: j.keys!.auth!, platform: detectPlatform(), user_agent: navigator.userAgent, last_seen: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "user_id,endpoint" },
      );
      setIsSubscribed(!error);
    } catch {
      setIsSubscribed(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    const isSupported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(isSupported);

    if (isSupported) {
      setPermission(Notification.permission);
      void checkExistingSubscription();
    }
  }, [user, checkExistingSubscription]);

  const registerServiceWorker = useCallback(async () => {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;
    return registration;
  }, []);

  const subscribe = useCallback(async () => {
    if (!user || !supported) return false;
    setLoading(true);

    try {
      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return false;
      }

      // Get VAPID key from edge function
      const { data: vapidData, error: vapidError } = await supabase.functions.invoke(
        "push-notification",
        { body: { action: "get_vapid_key" } }
      );

      if (vapidError || !vapidData?.vapid_public_key) {
        console.error("Failed to get VAPID key:", vapidError);
        setLoading(false);
        return false;
      }

      const registration = await registerServiceWorker();
      const applicationServerKey = urlBase64ToUint8Array(vapidData.vapid_public_key) as BufferSource;

      // If this device already has a subscription (e.g. created with older
      // VAPID keys), drop it first so we can re-subscribe with the current key.
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        try {
          await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", existing.endpoint);
        } catch { /* best-effort cleanup */ }
        await existing.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subJson = subscription.toJSON();
      localStorage.setItem("vapid_public_key", vapidData.vapid_public_key);

      // Save subscription to database
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: subJson.endpoint!,
          p256dh: subJson.keys!.p256dh!,
          auth_key: subJson.keys!.auth!,
          platform: detectPlatform(),
          user_agent: navigator.userAgent,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" }
      );

      if (error) {
        console.error("Failed to save subscription:", error);
        setLoading(false);
        return false;
      }

      setIsSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Push subscription error:", err);
      setLoading(false);
      return false;
    }
  }, [user, supported, registerServiceWorker]);

  const unsubscribe = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      if (registration) {
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          // Remove from database
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", user.id)
            .eq("endpoint", sub.endpoint);
        }
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("Unsubscribe error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Delete only this device's subscription row (used on logout).
  const removeCurrentDevice = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await registration?.pushManager.getSubscription();
      if (sub && user) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", sub.endpoint);
      }
    } catch {
      // Best-effort; never block sign-out.
    }
  }, [user, supabase]);

  return {
    supported,
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
    removeCurrentDevice,
  };
}
