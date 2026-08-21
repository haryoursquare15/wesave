# Vestara — Capacitor / iOS readiness audit

## 1. Build output — OK
Pure client-side Vite SPA, no SSR. `npm run build` emits `dist/` with `index.html` at the
root plus hashed `assets/`. `capacitor.config.ts` already points at `webDir: 'dist'`,
appId `ng.vestara.app`. No `server.url` is set, so the shell loads bundled assets
(what App Review prefers).

## 2. API calls & auth in a WebView
- All backend traffic is HTTPS `fetch` to the Cloud project + edge functions. No relative
  `/api` calls, so the `capacitor://localhost` origin is fine.
- Auth session is persisted by the Supabase client in `localStorage`
  (`persistSession: true`, `autoRefreshToken: true`). WKWebView keeps `localStorage`
  across app restarts, so sessions survive relaunch. No cookie-based auth anywhere —
  nothing depends on third-party cookies.
- `sessionStorage` is used only for ephemeral markers (`wesave_session_active`,
  `vestara_sandbox_signed_in`, `vestara_splash_seen`, referral code). It is cleared when
  the WebView process is killed, which just means the splash shows again and the user
  re-authenticates through the normal inactivity policy — no data loss.
- Idle policy (`useSessionEnforcement`, `useSandboxSessionEnforcement`) relies on
  `document.hidden`, which fires correctly on iOS background/foreground.
- CSP updated to allow `capacitor://localhost` / `ionic://localhost` in
  `default-src`, `img-src` and `connect-src`.

## 3. Safe areas — implemented
- `viewport-fit=cover` was already set in `index.html`.
- `src/index.css` now applies `env(safe-area-inset-top)` to every `.sticky.top-0` header
  and `env(safe-area-inset-bottom)` to every `.fixed.bottom-0` bar (covers `BottomNav`,
  sheets, sticky page headers app-wide), plus new `.safe-top` / `.safe-x` utilities
  alongside the existing `.safe-bottom`.

## 4. Native capabilities worth adding (plugins)
| Capability | Plugin | Why |
|---|---|---|
| Biometric unlock for the transaction PIN | `capacitor-native-biometric` | Face ID instead of typing the 4-digit PIN in `TransactionPinGate`; PIN stays the fallback. |
| Push notifications | `@capacitor/push-notifications` | Web Push / `sw.js` does **not** work in a Capacitor iOS WebView — APNs is required for bill, payout and contribution alerts. |
| Secure storage | `capacitor-secure-storage-plugin` or Keychain | Move the auth session + device fingerprint out of `localStorage` into Keychain on jailbroken/backup risk grounds. |
| Share sheet | `@capacitor/share` | Replaces `window.open` for invite/split links. |
| In-app browser | `@capacitor/browser` | For Flutterwave checkout and external biller links. |
| App state | `@capacitor/app` (installed) | Background/foreground events are more reliable than `visibilitychange` for the idle sign-out. |
| Haptics / Status bar / Splash | already installed | Wire up on native mount. |

## 5. Web-only navigation to change before shipping
- `src/pages/AppHome.tsx` — **fixed**: absolute `https://app.vestara.ng/auth` links replaced
  with in-app router navigation (they would have kicked the user out of the shell).
- `src/pages/Wallet.tsx:281` — `window.location.href = data.payment_link` (Flutterwave).
  Should use `Browser.open()` on native, otherwise the checkout replaces the app shell.
- `src/components/vfd-sandbox/SandboxSplitTab.tsx:498` — `window.open(..., "_blank")` for
  WhatsApp/X/Telegram/mailto. Use `@capacitor/share` (the `navigator.share` branch above
  it already works) or `Browser.open()`.
- `src/components/admin/AssociationApprovalsTab.tsx:43` — `window.open(url, "_blank")` for
  document preview; same fix (admin-only, low priority).
- `src/components/vfd-sandbox/SandboxHeader.tsx:14` — back button uses
  `window.history.length` + `document.referrer`; `document.referrer` is empty in the
  WebView, so it always falls back to `navigate(-1)` / `/app`. Acceptable, but a stack-aware
  back is nicer.
- `src/hooks/usePushNotifications.ts` — service-worker registration must be skipped when
  `Capacitor.isNativePlatform()` and replaced by APNs registration.
- `index.html` devtools/right-click blocking and `X-Frame-Options` meta are inert in a
  WebView; harmless.
