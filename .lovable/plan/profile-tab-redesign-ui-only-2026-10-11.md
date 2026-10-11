# Profile tab redesign (UI only)

Turn the current avatar dropdown into a full Profile screen reachable from the bottom tab and the header avatar. All business logic, VFD calls, ledger, Supabase policies and auth stay untouched — we only reshape the surface.

## New screen

A new `SandboxProfile` view, selected by the existing "Profile" bottom tab (replaces the dropdown opening). Tapping the header avatar routes to the same view.

Header card: photo (tap to change — reuses existing `ProfilePictureUpload`), full name, email, Tier pill.

Grouped white cards with uppercase section titles, 56px rows, orange icon chip + label + right value/chip + chevron, inline toggles.

## Sections

1. **Account** — Mobile (masked), BVN (masked + Verified chip, read-only), NIN (masked, read-only), Withdrawal bank, Tier & limits, My VFD account number (copy), Statements. Values read from existing `vfd.client`; copy button on NUBAN; other rows link to existing screens where they exist, else a "Coming soon" sheet so we don't invent business logic.
2. **Security** — Login PIN row → sheet with Change / Forgot (reuses `LoginPinSettings`). Transaction PIN row → sheet with Change / Forgot (reuses existing `TransactionPinGate` + `transaction-pin` function; "Forgot" opens the existing reset path). Change password (reuses `ChangePasswordDialog`). Biometric login toggle (reuses `LoginPinSettings` biometric). Manage devices (reuses `DeviceManagement`). "Use biometrics to confirm transfers", Auto-lock timing, Login activity, Sign out of all devices — rendered as rows that open a "Coming soon" sheet, so UI matches the brief without changing auth logic.
3. **Notifications** — WhatsApp alerts row opens the existing `WhatsAppAlertSettings` sheet with the four category toggles presented visually (persisted to the existing `whatsapp_preferences` row via a small `categories` jsonb-less local-only state — if we can't persist, we show them as display-only "On" chips to avoid schema changes). Push notifications toggle (reuses `usePushNotifications`). Email statements toggle — local UI only with a note.
4. **Preferences** — Appearance segmented control System/Light/Dark, wired to `next-themes` (already installed). Applies across the app via existing `.dark` tokens in `index.css`.
5. **Privacy & data** — Personalised insights toggle (local UI), Download my data and Delete my account rows link to existing routes/sheets where present.
6. **Support** — Red "Report fraud / Freeze my account" row opens a confirm sheet (UI only, submits nothing). Contact us, FAQ, Complaints — link to existing `/support/new`, `/help`.
7. **About** — Terms, Privacy, App version, "Banking services provided by VFD Microfinance Bank".
8. **Sign out** — Full-width outlined red button with confirm sheet (reuses existing `signOut`).

## Scope boundaries

- No new tables, no new edge functions, no new PIN flows. Rows that would require new backend behaviour (auto-lock, biometric-for-transfers, sign-out-all-devices, email statements, personalised insights toggle, freeze account, WhatsApp category toggles persistence) render as proper rows with "Coming soon" sheets so the layout matches the brief exactly without touching money/auth logic.
- Keep orange `#E8590C`, navy `#0F1B2D`, Inter, 16px radius — all via existing tokens, no hardcoded colors.
- Dark mode: wire `next-themes` provider in `App.tsx`; existing `.dark` tokens already defined.

## Files

- New: `src/components/vfd-sandbox/SandboxProfile.tsx`, `src/components/vfd-sandbox/profile/ProfileRow.tsx`, `src/components/vfd-sandbox/profile/ProfileSection.tsx`.
- Edit: `src/pages/VfdSandbox.tsx` — add `"profile"` view, point bottom-nav Profile and header avatar to it, drop the dropdown menu usage. Add `ThemeProvider` wrapping.
- Edit: `src/App.tsx` — wrap with `next-themes` ThemeProvider.
- Reuse: `LoginPinSettings`, `ProfilePictureUpload`, `WhatsAppAlertSettings`, `ChangePasswordDialog`, `DeviceManagement`, `TransactionPinGate`, `usePushNotifications`.

Ask before building if you'd rather I actually implement the "Coming soon" rows (auto-lock, biometric-for-transfers, freeze account, etc.) as real backend features in a follow-up turn.
