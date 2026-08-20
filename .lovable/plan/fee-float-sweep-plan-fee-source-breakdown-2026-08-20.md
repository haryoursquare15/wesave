# Fee float sweep — plan + fee source breakdown

## Part 1 — Every active fee source in production

| Fee | Trigger | Amount | Where charged |
|---|---|---|---|
| Bills convenience fee | Any bill/airtime/data/electricity purchase | VFD biller's `convenienceFee` (flat, per biller — e.g. ₦30 SportyBet) **plus** the biller's `itemFee` (e.g. ₦100 IKEDC prepaid). Resolved server-side, never client-supplied | `vfd-sandbox-products` → `resolveConvenienceFee()` + `itemFee`, debited as part of `totalDebit` |
| Inter-bank transfer fee | Outbound transfer to another bank, after the user's monthly free quota for their balance tier | Flat ₦20 (₦0 while free quota remains; Tier 4 always free) | `vfd-banking` → `TRANSFER_FEE` in the fee quote |
| Stamp duty | Every inter-bank transfer (all tiers) | Flat ₦50 | `vfd-banking` → `STAMP_DUTY` |
| Intra-Vestara transfer | Vestara → Vestara | ₦0 | `vfd-banking` |
| Split Pay service fee | Creating a split | Flat ₦10 per split. Bills/custom splits: creator pays all ₦10. Otherwise divided across participants (`ceil` to kobo) | `vfd-sandbox-products` → `SPLITPAY_SERVICE_FEE`, swept via `vestara_split_fee_to_revenue` |
| Ajo/Thrift DDM mandate setup | Each member accepting a direct-debit mandate for a group | Flat ₦100 one-time, split ₦50 Vestara / ₦50 NIBSS | `vfd-sandbox-products` → `AJO_DDM_MANDATE_FEE` |
| GoalSave / investment mandate setup | Authorizing a savings mandate | Flat ₦100 (`VFD_MANDATE_FEE`), same 50/50 split | `vestara-ledger` (`authorize_mandate`) and `vfd-mandate-engine` |
| Savings early-withdrawal penalty | Early exit on Vault/LockMax | Percentage per product (`early_withdrawal_penalty_pct`) | `vestara-ledger` early-withdraw handler |
| Thrift payout fee | Group payout | Passed-in `fee`, currently 0 in production | `vestara-ledger` `thrift_payout` |

All of these credit the internal `revenue` account in the Vestara ledger at the moment they're charged. The cash, however, stays in the customer's VFD sub-account until swept — that's the fee float.

## Part 2 — What I'll build

**New edge function `vfd-fee-sweep`** (cron-token auth, same pattern as the reconciler):

1. Compute per-user unswept fee float = sum of `revenue` credits attributed to the user, minus already-swept amounts recorded in a new `vfd_fee_sweeps` table.
2. Skip users whose float is below the threshold (default **₦50**, env-tunable).
3. Cap the sweep at the user's live VFD sub-account balance (never sweep cash that isn't there).
4. Insert a `vfd_fee_sweeps` row `status='pending'` with a deterministic reference `VES-FEESWEEP-<user>-<yyyymmdd>` under a unique index — this is the idempotency lock; a duplicate run hits the unique violation and skips.
5. Real VFD transfer: customer sub-account → corporate pool `1047279595`, narration `Vestara fee sweep`, with `uniqueSenderAccountId` set per the POOL model.
6. On success mark `completed` + store the VFD reference; on failure mark `failed` with the error so a later run retries (a failed row does not block a retry, a completed one does).

**Ledger:** no revenue-account entries are created or modified. The sweep is cash-location only. To keep the wallet ledger honest, the customer's ledger wallet balance is unchanged too — the fee was already debited from them at charge time, so the sub-account cash being moved is Vestara's, not theirs.

**Pool-originator guard:** the sweep narration/reference is added to the `vfd-inflow-webhook` ignore list so the arriving pool credit never re-credits anyone.

**Cadence:** daily cron at 02:00 WAT (01:00 UTC) — outside VFD's 00:00 WAT EOD window and outside the other reconcilers. Threshold ₦50 so tiny balances accumulate instead of burning transfer calls.

**Reconciler:** `vfd-pool-reconciler` keeps subtracting fee float, but now only the *unswept* portion, so swept fees stop being masked.

## Part 3 — First run

After deploy I'll run the sweep once manually and report actual moved amounts for the three known floats (₦330, ₦60, ₦100). The ₦297.14 admin float is excluded until its source is explained — I'll add an explicit skip-list for that account on the first run.
