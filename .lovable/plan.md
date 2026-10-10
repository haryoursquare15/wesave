# Email verification + 6-digit login PIN + biometric unlock

Three changes, all on the customer sign-in flow. The 4-digit transaction PIN is untouched.

## 1. Verify email during sign-up

Today the sign-up form auto-confirms any address, so typos and fake emails get in. New flow:

1. Step 1 — name and phone (unchanged).
2. Step 2 — email + password. Pressing **Continue** sends a 6-digit code to that email and moves to step 3. Nothing is saved yet.
3. Step 3 — enter the 6-digit code (with a 30-second **Resend code** link). On success the account is created and the user is signed in. Wrong code shows "Code is incorrect"; after 5 wrong attempts or 15 minutes the code is cleared and they request a new one.

The code is sent through the existing branded email sender (same look as other Vestara emails).

## 2. 6-digit login PIN

A new PIN, separate from the 4-digit transaction PIN. After a user signs in once with email and password on a phone, they can set a 6-digit login PIN in Settings → Security. From then on, that phone opens straight to the PIN pad instead of asking for the password. A new phone still asks for the password the first time.

- 5 wrong tries locks the PIN for 15 minutes (same rules as the transaction PIN).
- "Use password instead" is always available as a fallback.
- "Forgot PIN" signs the user out and clears the quick unlock, so they sign in with the password again.
- Weak PINs (`000000`, `123456`, all same digit, straight sequences) are rejected.

## 3. Biometric unlock (Face ID / fingerprint)

Optional toggle in Settings → Security, only visible once the login PIN is set and the phone supports it. When on, the sign-in screen shows a **Use Face ID / fingerprint** button next to the PIN pad. One tap, phone prompts, and they're in. PIN remains as the fallback.

Uses the phone's built-in biometric check (WebAuthn platform authenticator on web/PWA; Capacitor BiometricAuth on native if later packaged). No fingerprints or face data leave the phone.

## What the user sees on the sign-in screen

- First time on this phone → email + password form (as today).
- After login PIN is set on this phone → 6-digit PIN pad, with "Use Face ID / fingerprint" (if enabled) and "Use password instead" below.
- "Forgot PIN" link clears quick unlock and returns to password sign-in.

---

## Technical notes

**Email OTP**
- New table `signup_email_otps` (email, code_hash, expires_at, attempts, created_at). RLS: no public access; service role only.
- New edge function `sandbox-signup-otp` with `send` and `verify_and_create` actions. `verify_and_create` creates the auth user with `email_confirm: true`, sets metadata `{ sandbox_account: true, full_name, phone }`, and returns a session so the client can `setSession`.
- Branded template reusing `_shared/send-branded-email.ts`.
- `sandbox-auto-confirm` stays for now (back-compat) but is no longer called from the UI.

**Login PIN**
- New table `login_pins` (user_id PK, pin_hash, failed_attempts, locked_until, pin_set_at, last_used_at). RLS: owner read-only; writes via edge function.
- New edge function `login-pin` mirroring `transaction-pin`: actions `get_status`, `set_pin`, `change_pin`, `verify_pin`, `disable_pin`. 6-digit, bcrypt, 5 attempts, 15-minute lockout, weak-PIN rejection.
- Verify is called by the quick-unlock flow (unauthenticated — takes `{ email, pin }`), rate-limited per email/IP in the same `login_attempts` table used by `secure-login`. On success it mints a fresh session and returns it.

**Quick unlock on this phone**
- After a successful email/password sign-in, if a login PIN exists we store the user's email + a device flag in `localStorage` under `vestara.sandbox.quickUnlock`. No tokens are stored.
- Sign-in screen checks the flag and shows the PIN pad for that email; PIN → `login-pin verify` → `setSession` on `sandboxSupabase`.
- "Forgot PIN" / "Use password instead" clears the flag and reverts to the password form.

**Biometric**
- Settings toggle registers a WebAuthn platform credential (`navigator.credentials.create`, `userVerification: 'required'`) scoped to this origin, stores the credential id locally and server-side (`login_biometric_credentials` table: user_id, credential_id, public_key, counter).
- Sign-in biometric button calls `navigator.credentials.get`, verifies on a new `biometric-login` edge function, mints a session on success.
- Graceful fallback: if WebAuthn is unavailable the toggle stays hidden and sign-in only shows PIN + password.

**Settings page additions**
- Security → Login PIN: Set / Change / Disable.
- Security → Biometric unlock: on/off toggle (disabled if no login PIN).

**Files touched**
- `supabase/functions/sandbox-signup-otp/` (new)
- `supabase/functions/login-pin/` (new)
- `supabase/functions/biometric-login/` (new)
- `src/contexts/SandboxAuthContext.tsx` — new `requestSignupOtp`, `verifySignupAndSignIn`, `quickUnlock` helpers.
- `src/pages/SandboxAuth.tsx` — add OTP step, PIN pad for quick unlock, biometric button.
- `src/pages/Settings.tsx` — Login PIN + biometric controls (new components under `src/components/security/`).
- One migration for the three new tables + grants + RLS.
