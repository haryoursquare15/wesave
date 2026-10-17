# Android push configuration

## Added
- `public.device_tokens`: owner-scoped Android device tokens, unique token, last-seen timestamp, device-only logout cleanup, account-deletion cleanup.
- `src/lib/androidPush.ts`: wrapper detection, permission request, token polling for ten seconds, launch registration, logout cleanup.
- `supabase/functions/_shared/fcm.ts`: service-account OAuth with cached access token, high-priority data-only FCM delivery and invalid-token cleanup.
- `supabase/functions/_shared/android-push-policy.ts`: notification preferences and Android lock-screen privacy.
- `supabase/functions/send-push/index.ts`: service-role-only sending entrypoint.
- `src/test/androidPush.test.ts`: eleven registration, cleanup, preference and privacy tests.

## Updated
The shared push hook, customer Home banner, Profile permission controls, both sign-out contexts, and existing `push-notification` dispatcher now support the Android wrapper. Web Push remains available to browser/iPhone clients. Existing notification triggers keep using their existing internal authentication. `/app` routing and payment logic were not changed.

## Manual setup
1. The Firebase service account is already saved securely as `FCM_SERVICE_ACCOUNT`.
2. Enable Firebase Cloud Messaging API (HTTP v1) for that Firebase project; the service account needs Firebase Cloud Messaging sending permission.
3. The Android wrapper must use the same Firebase project, include `VestaraApp` in its user agent, and expose `window.VestaraAndroid.requestPushPermission()` and `getFcmToken()`.
4. Its Firebase messaging service must create/display notifications from data messages (`title`, `body`, `url`, `tag`), manage the Android notification channel, and request Android notification permission. A data-only message does not automatically display a system notification.
5. Open the updated app in the Android wrapper, enable notifications, then verify foreground/background delivery on a real device.

Android notification text is deliberately generic to avoid exposing balances or account numbers. Detailed messages remain in-app. Sending returns separate `web` and `fcm` counts; the legacy Web Push response fields remain for compatibility.

## Verification
Eleven automated tests passed. Signed-in UI testing with a simulated native bridge verified permission calls, token persistence/readback and logout deletion. The deployed service-role-only endpoint rejected a user-session request. Real Android delivery and Firebase API/permission configuration remain unverified until a real device registers.

The table stores user IDs as plain UUIDs with an app-owned auth lifecycle cleanup trigger rather than a foreign key into the managed auth schema.