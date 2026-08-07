# Rename customer-facing routes (remove "sandbox" from URLs)

Goal: real customers see clean URLs. This is a **routing + link-generation change only** — no database, edge function, or storage changes.

## 1. Routes to rename

The live customer app currently lives under `/vfd-sandbox`. Proposed replacements (all sandbox routes are the actively used product; the older `/dashboard`, `/wallet`, `/groups` pages are the legacy pre-VFD app and stay untouched to avoid collisions):

| Current | New | Notes |
|---|---|---|
| `/vfd-sandbox` | `/app` | main product shell (dashboard, savings, bills, transfers, split) |
| `/vfd-sandbox/auth` | `/signin` | signup/login page. `?mode=signup` still supported |
| `/vfd-sandbox/forgot-password` | `/password/forgot` | |
| `/vfd-sandbox/reset-password` | `/password/reset` | must match backend redirect allowlist |
| `/vfd-sandbox/invite/:token` | `/join/:token` | group invite landing |
| `/sandbox-health` | `/vst-ops-9f3c/health` | staff-only; moves under the existing obscured ops base |

Not renamed: `/goal/:slug` (public campaign pay), `/terms`, `/privacy`, `/aml-policy`, `/kyc-policy`, `/unsubscribe`, the ops console paths.

Why `/signin` and not `/auth`: `/auth` is already bound to the legacy `Auth` page, which signs in against the **main** auth client, not the product's client. Repointing `/auth` would silently change which session a visitor creates. `/signin` is unambiguous and clean. (If you prefer `/auth`, the legacy page must be retired in the same change — say the word and the plan is adjusted.)

## 2. The `sb-sandbox-auth` localStorage key

**Recommendation: do not rename it in this change.** The key is invisible to customers, so it earns nothing today, and renaming it naively drops every active pilot session.

If we do want it renamed later (e.g. to `sb-vestara-auth`), it can be done with **zero forced logouts** via a one-time migration that runs *before* the client is created:

```ts
// runs at module load, before createClient()
const OLD = "sb-sandbox-auth", NEW = "sb-vestara-auth";
const legacy = localStorage.getItem(OLD);
if (legacy && !localStorage.getItem(NEW)) {
  localStorage.setItem(NEW, legacy);
  localStorage.removeItem(OLD);
}
```

The stored value is a JSON session (access + refresh token); copying it under a new key is exactly what the auth library would read, so sessions survive and refresh normally. Keep the shim in place for ~90 days, then delete it. Treat it as a separate, later change — not bundled with the route rename.

## 3. Existing shared links — and backward compatibility

Links already out in the wild that point at old paths:

- **Group invite links** — built client-side as `${origin}/vfd-sandbox/invite/<token>` and shared over WhatsApp/SMS. Tokens live in the database and remain valid; only the URL shape changes.
- **Split-pay share links** — `${origin}/vfd-sandbox?split=<id>`.
- **Password-reset emails already sent** — point at `/vfd-sandbox/reset-password` and are valid for their token lifetime.
- **Signup confirmation emails** — redirect to `/vfd-sandbox`.
- **Bookmarks / browser history** of pilot users.

Therefore: **yes, add permanent client-side redirects.** Keep every old path registered in the router as a redirect-only route that forwards to the new path, preserving the token param and the query string (`?split=`, `?mode=`, and the auth hash fragment used by recovery links). Nothing 404s, no invite dies. Old paths stay `noindex` and are kept indefinitely — they cost one line each.

## 4. Explicitly out of scope

No changes to: table names (`vfd_sandbox_*`), edge function names (`vfd-sandbox-products`, `vfd-banking`, `sandbox-flow-healthcheck`, `sandbox-auto-confirm`, …), storage bucket `vfd-sandbox-kyc-docs`, RPC names, cron jobs, VFD gateway config, or webhook URLs. Internal component/file names (`SandboxDashboard.tsx` etc.) also stay — renaming files adds churn and risk for zero customer benefit.

## 5. Order of operations (no downtime, no forced re-login)

1. Add a `src/lib/appRoutes.ts` constants module (`APP_HOME`, `SIGN_IN`, `FORGOT_PASSWORD`, `RESET_PASSWORD`, `JOIN`) so no path is hardcoded twice.
2. **Add the new routes alongside the old ones.** Both work. Deploy. Nothing can break here because nothing was removed.
3. Add the new paths to the backend auth redirect allowlist (site URL + additional redirect URLs) *before* any email starts using them, otherwise reset links bounce.
4. Switch link *generation* to the new paths: invite dialog, split share link, signup `emailRedirectTo`, password-reset `redirectTo`, landing-page CTAs, in-app `navigate()` calls, session-timeout redirect.
5. Convert the old paths from real routes to redirect-only routes (query string and hash preserved).
6. Update `PUBLIC_ROUTES` / `isPublicRoute` so the new paths are treated as public, and update `robots.txt` (disallow `/app`, allow `/signin`).
7. Verify: sign in, invite link (old + new URL), split link, password reset round-trip, deep refresh on `/app`, staff health page gate.
8. Publish.

Session impact: **none**. The auth session lives in `localStorage` keyed by origin, not by path — moving from `/vfd-sandbox` to `/app` on the same domain keeps every pilot user signed in. The only way to log everyone out is renaming the storage key, which step 2 defers.

## Technical notes

- `src/App.tsx`: route table, `PUBLIC_ROUTES`, `isPublicRoute` prefix check.
- Redirect component: reads `useParams`/`useLocation`, returns `<Navigate to={new + search + hash} replace />`.
- Files touching old paths: `SandboxAuth.tsx`, `SandboxForgotPassword.tsx`, `SandboxResetPassword.tsx`, `SandboxInvite.tsx`, `VfdSandbox.tsx`, `SandboxHeader.tsx`, `SandboxGroupInviteDialog.tsx`, `SandboxSplitTab.tsx`, `SandboxAuthContext.tsx`, `useSandboxSessionEnforcement.ts`, `VestaraLanding.tsx`.
- Recovery links deliver the session in the URL **hash**; the redirect must forward `location.hash` or password reset silently fails.
