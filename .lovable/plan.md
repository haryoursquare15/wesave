# Goal Savings 2.0 — Recurring Commitment Savings with DDM

Convert Goal Savings from a flexible savings product into a commitment-based recurring savings product, with an embedded VFD Direct Debit Mandate (DDM) authorization in the same flow. The customer cannot withdraw until maturity, and interest is paid at maturity at a flat per-frequency rate.

## Scope & assumptions

- This is the **sandbox** Goal Savings product (lives in `src/components/vfd-sandbox/SandboxSavings.tsx`, backed by `supabase/functions/vfd-sandbox-products/index.ts` and the existing `vestara_savings` / `vestara_products` / `vestara_rate_configs` tables, product code `goalsave`).
- VFD Direct Debit Mandate API: I'll wire calls in the edge function, but I'll need the actual endpoint paths and mandate-fee amount from you (see Open questions). For now I'll abstract behind `vfdCreateMandate()` / `vfdGetMandateStatus()` with a clearly marked TODO so the rest of the flow ships and is testable end-to-end.
- Rate config: I'll use `vestara_rate_configs` with two new rows for `goalsave` — one keyed by `weekly`, one by `monthly`. Existing rows for goalsave remain editable in the admin Rate Config tab.
- Scheduling/collection runs on the existing recurring cron infrastructure (`vfd-pool-reconciler` style); the actual debit is performed by VFD's DDM, we only record the receipt webhook.

## User flow

```text
[Goal Setup] → [Mandate Authorization] → [Review] → [Confirmation]
```

1. **Goal Setup**: name, optional purpose, contribution amount (≥ ₦1,000), frequency (Weekly/Monthly), tenor (weekly ≥ 4 wks, monthly ≥ 1 mo). Live preview of maturity date, schedule, applicable rate, estimated maturity value.
2. **Mandate Authorization**: pre-filled from step 1 (amount, frequency, start = today WAT, end = maturity, customer profile). Read-only summary + "Authorize" CTA that opens VFD mandate authorization (redirect/OTP per VFD spec).
3. **Mandate Fee Disclosure**: prominent "Mandate Setup Fee: ₦X — charged to your wallet now" with explicit checkbox consent.
4. **Review**: full summary card incl. projected contributions, projected interest, maturity value, debit schedule, mandate fee, and the prominent **lock-in notice**.
5. **Confirmation → Success**: shows next debit date, frequency, maturity, projected maturity value, CTAs *View Goal Savings* / *Return to Dashboard*.

A persistent stepper (Goal → Mandate → Review → Confirm) sits at the top across all four steps. Back/Edit preserves all entered data (kept in component state + draft row in DB so a page refresh resumes).

## Data model changes

New columns on `vestara_savings` (for `goalsave` rows only):

- `commitment_frequency` text — `weekly` | `monthly`
- `commitment_amount` numeric — per-debit amount
- `tenor_count` int — weeks or months depending on frequency
- `next_debit_at` timestamptz
- `mandate_id` text — VFD mandate id
- `mandate_status` text — `pending` | `authorized` | `failed` | `cancelled`
- `mandate_fee` numeric
- `activation_status` text — `pending_mandate` | `active` | `matured` | `failed`

New table `vfd_savings_debit_schedule` (one row per planned debit): `savings_id`, `seq`, `scheduled_at`, `amount`, `status` (`scheduled`/`succeeded`/`failed`/`retrying`), `attempt_count`, `vfd_reference`, `failed_reason`.

New table `vfd_savings_mandate_events` (audit): `savings_id`, `mandate_id`, `event_type`, `payload`, `created_at`.

Rate configs: insert two `goalsave` rows in `vestara_rate_configs` keyed off `notes` (e.g. `{"frequency":"weekly"}` / `{"frequency":"monthly"}`) or add a `frequency` column scoped to `goalsave`. I'll go with adding a nullable `frequency` text column to `vestara_rate_configs` since the admin UI already iterates rows.

All tables get GRANTs + RLS (user can read/insert their own; service_role full; admin via `has_role`).

## Backend (`vfd-sandbox-products` edge function)

New actions:

- `goalsave_v2_quote` — given amount/frequency/tenor, returns rate, maturity date, projected interest, projected maturity value, mandate fee, generated debit schedule preview.
- `goalsave_v2_create` — creates `vestara_savings` row with `activation_status='pending_mandate'`, persists schedule rows, returns savings id + mandate-init payload.
- `goalsave_v2_authorize_mandate` — calls VFD DDM create, charges mandate fee from wallet (recorded in `vestara_fee_ledger` as `fee_type='mandate_setup'`), stores `mandate_id`, flips `activation_status` to `active` on success. Idempotent (retries safe).
- `goalsave_v2_mandate_webhook` — receives VFD mandate status updates (authorized/failed/cancelled) and debit-collection results; updates schedule + credits savings balance on success.
- `goalsave_v2_retry_mandate` — re-attempts mandate creation if step 2 failed.

Lock enforcement: existing withdraw/break paths must reject when `product_code='goalsave'` AND `activation_status` ∈ `{pending_mandate, active}` AND `now() < maturity_date`. Maturity job credits principal+interest and sets `matured`.

## Frontend

New entry path inside `SandboxSavings.tsx`: when user picks the *Goal Savings* product, route to a new `GoalSavingsV2Wizard` component (or full page) instead of the legacy dialog. Keep legacy flow disabled behind a feature flag in case we need to roll back.

Components (mobile-first, follows existing sandbox patterns + `TransactionPinGate` on the final confirm):

- `GoalSavingsV2Wizard.tsx` — owns step state, draft persistence, stepper UI.
- `steps/GoalSetupStep.tsx`
- `steps/MandateAuthorizeStep.tsx`
- `steps/ReviewStep.tsx`
- `steps/SuccessStep.tsx`
- `GoalSavingsScheduleSheet.tsx` — reused on Review + on the goal detail screen.

All copy uses friendly, action-oriented language per project standards. Lock-in notice rendered with `Alert` (destructive variant) on Review.

## Error handling

- Mandate failure → savings row stays `pending_mandate`, success screen swapped for a "Finish mandate setup" CTA on the goal detail screen; retry uses `goalsave_v2_retry_mandate`.
- Debit failure → webhook marks schedule row `failed`, notification fired via existing notification system, retry per VFD policy (attempt_count incremented).
- VFD API unavailable → friendly toast, draft preserved in DB (`activation_status='pending_mandate'`, no mandate_id), customer can resume from dashboard banner.

## Open questions (need from you before I wire VFD live)

1. **VFD DDM endpoints + auth flow** — do you have the API spec (create mandate, get status, cancel)? Is authorization done via OTP in-app or via a redirect URL?
2. **Mandate setup fee** — exact amount (₦X)?
3. **Weekly & monthly default interest rates** for goalsave v2 — what should I seed in `vestara_rate_configs`?
4. **Retry policy for failed debits** — how many retries, what cadence?

I'll start with the schema + UI + abstracted backend (returning a stub mandate id so the flow is testable) and wire the real VFD calls as soon as you confirm the four items above.
