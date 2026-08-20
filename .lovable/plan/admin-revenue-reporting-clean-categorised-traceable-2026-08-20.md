# Admin revenue reporting: clean, categorised, traceable

## 1. Exclude test/internal accounts
- Add `internal_account boolean not null default false` to `profiles`.
- Flag the known test/staff accounts (test7@hhh.com, test8@hhh.com, admin/staff logins, any `@hhh.com` address).
- Every revenue query filters these users out by default, with an "Include internal accounts" toggle in the UI so nothing is permanently hidden.

## 2. Revenue by source
A revenue entry is any credit to the internal `revenue` account. Each one is classified server-side into a fee type from the transaction reference/metadata:

| Source | How it's identified |
|---|---|
| Bills convenience fee | `source: bill_payment_settle` / `-SETTLE` reference |
| Biller discount (VFD margin) | `leg: biller_discount` / `-VFDDISC` |
| Transfer fee | transfer-fee metadata from `vfd-banking` |
| Stamp duty | stamp-duty metadata |
| Split Pay service fee | `fee_type: splitpay_service_fee` |
| Mandate setup fee (Ajo / GoalSave) | mandate fee metadata / reference |
| Early-withdrawal penalty | penalty metadata on savings exit |
| Other | anything unmatched, so no naira is lost from the total |

## 3. Traceability
New admin RPCs:
- `admin_get_revenue_breakdown(_start, _end, _include_internal)` — totals per fee source plus grand total.
- `admin_list_revenue_entries(_start, _end, _source, _include_internal)` — the individual rows: user name/@username, transaction reference, fee type, amount, timestamp.

Clicking a source card in the dashboard drills into exactly the transactions behind that figure. CSV export included.

## 4. Swept vs unswept
Using `vfd_fee_sweeps`: show recognised revenue, amount already swept into the corporate pool, and the remaining float still sitting in customer sub-accounts — accounting figure next to real cash position.

## 5. UI
A new "Revenue Analytics" section at the top of the existing Platform Revenue tab: date-range filter (today / 7d / 30d / all), source breakdown cards, swept-vs-float card, and a drill-down table. The existing settlement/ledger views stay as they are.

## Technical notes
- One migration: `profiles.internal_account` + the two security-definer RPCs (admin-only, checked with `is_any_admin()`).
- Frontend: new `useRevenueAnalytics` hook and a `RevenueAnalytics` component rendered inside `PlatformRevenueTab`.
- No change to how fees are charged or to the ledger itself — this is reporting only.
