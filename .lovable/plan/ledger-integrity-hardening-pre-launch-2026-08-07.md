# Ledger integrity hardening — pre-launch

## Urgent finding first

All four affected features are **live and reachable by real users right now**. The production dashboard enables Split Bills, Target Save, and Goal Fund; only Associations and Virtual Card are gated as "Coming soon". The refund/payout actions behind them (`cancel_split`, `decline_split`, `withdraw_campaign_escrow`, Target Ajo goal payout) are wired to live UI hooks.

Ranked by exposure:

| # | Path | Trigger | Exposure |
|---|------|---------|----------|
| 1 | SplitPay cancel refund | Creator cancels a split with paid participants | Live, one tap, multi-user |
| 2 | SplitPay participant decline refund | Participant declines after paying | Live, one tap |
| 3 | Crowdfunding escrow withdrawal | Campaign owner withdraws escrow to wallet | Live, needs funded campaign |
| 4 | Target Ajo DDM payout | Group hits its target | Live, but only fires on goal completion |

Each credits `vfd_user_balances` only. No ledger entry is written, so the cache reads high with nothing backing it — money appears in a wallet that the ledger does not account for. Current drift is zero only because none of these have fired in production yet.

Because these are live, the sequencing below puts the structural guarantee first and ships it as one change, rather than patching call sites one at a time.

## Approach

The root problem is that two balance stores can be written independently. The fix removes that possibility at the database level rather than by convention.

```text
BEFORE                          AFTER
creditWallet() ─┐               all money paths
                ├─> cache            │
vestara_post_   │                    v
transaction() ──┴─> ledger    vestara_post_transaction()
                                     ├─> ledger entries
   (either can run alone)            ├─> vestara_accounts.balance
                                     └─> vfd_user_balances  (same txn)
```

## Work items

### 1. Fold the cache into `vestara_post_transaction`

Extend the RPC so that, within the same transaction that writes ledger entries and updates `vestara_accounts.balance`, it also applies the matching delta to `vfd_user_balances` for every non-system account touched. Wallet entries move `total_balance`; savings-type accounts move `savings_balance`; locked accounts move `locked_balance`. Reuses the existing locking and clamping logic from `apply_balance_delta`.

Result: it becomes structurally impossible to write the ledger without the cache, or the cache without the ledger, for any path that goes through the RPC. This is the guarantee, not a convention.

### 2. Migrate the four `creditWallet()` call sites

Replace each with a ledger-backed RPC that posts a proper double-entry pair:

- SplitPay cancel refund and participant decline refund: new `vestara_split_refund` posting `split_holding -> wallet`, idempotent on the refund reference.
- Crowdfunding escrow withdrawal: new `vestara_campaign_withdraw` posting `crowdfunding_pool -> wallet`, idempotent on campaign plus withdrawal reference.
- Target Ajo DDM payout: new `vestara_target_payout` posting `thrift_pool -> wallet`, idempotent per member per payout.

All three route through `vestara_post_transaction`, so they inherit the cache update from item 1 automatically.

### 3. Retire `creditWallet()`

Delete the helper and the raw `applyBalanceDelta({ total })` credit variant so no future code can credit a wallet outside the ledger. Savings/locked-balance deltas that are legitimately cache-only bookkeeping stay, but credits to spendable balance no longer have a non-ledger route.

### 4. Fix the reconciler read-then-write race

In `vfd-sandbox-products` (bill refund path, around line 3490), remove the hand-rolled read of `vfd_user_balances` followed by an update. Once item 1 lands, `vestara_bill_release` already updates the cache atomically, so the mirror block is deleted outright rather than replaced.

### 5. Scheduled drift check with alerting

- A `vestara_detect_balance_drift()` function comparing, per account: `vestara_accounts.balance` vs. the sum of its ledger entries, and each wallet vs. its `vfd_user_balances` row.
- Findings written to a `ledger_drift_findings` table with account, expected, actual, delta, and detection time.
- A `vestara-drift-monitor` edge function that runs the check and, on any finding, raises an alert — an in-app admin notification plus an email to the admin address, not just a log line. Silent when clean.
- Scheduled every 5 minutes via `pg_cron`, authenticated with a private cron token from `internal_cron_tokens` (same pattern as the bills reconciler).
- Surfaced in the admin portal as a Ledger Integrity panel showing current findings.

### 6. Backfill and verify

Re-run the full drift audit after deploy and confirm zero rows, then run a controlled end-to-end test of each of the four migrated paths in the live environment with a small amount, verifying ledger and cache move together.

## Technical notes

- All new RPCs are `SECURITY DEFINER` with `search_path = public` and idempotency guards on reference, matching `vestara_bill_reserve`/`_settle`/`_release`.
- No changes to `vestara_accounts` or `vfd_user_balances` schema; only the new findings table is added.
- `apply_balance_delta` is kept for savings/locked bookkeeping that is genuinely non-ledger, but is no longer used to credit spendable wallet balance.
- Existing balances are already in sync, so no data migration is required — this is purely forward-looking prevention plus detection.

## Order of execution

1. Cache folded into `vestara_post_transaction` (closes the structural hole)
2. Four call sites migrated to ledger-backed RPCs, `creditWallet()` deleted
3. Reconciler mirror block removed
4. Drift detection, alerting, and cron
5. Verification pass
