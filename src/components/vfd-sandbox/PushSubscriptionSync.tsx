import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Invisible: keeps this device's push subscription registered for the
 * signed-in user (re-links after sign-in, renews after key changes).
 */
export function PushSubscriptionSync() {
  usePushNotifications();
  return null;
}
