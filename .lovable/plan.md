# Bill payments: hold-and-settle + stale-pending auto-refund

Today's UAT showed the real risk: VFD returns `09` (pending), we debit the customer's wallet immediately, and if VFD never resolves, the money simply sits gone until someone notices. Two changes fix that.

## 1. Hold/reserve instead of immediate debit

Today, a bill payment debits `wallet -> settlement` the moment we send the request, and that debit is treated as final.

New flow:

```text
1. Reserve   wallet        -> bills_hold      (funds leave spendable balance, not yet spent)
2. Call VFD
3a. status 00 (success)    -> settle: bills_hold -> settlement, receipt = success
3b. status 09 (pending)    -> stay in bills_hold, receipt = pending
3c. explicit failure       -> release: bills_hold -> wallet, receipt = failed/refunded
4. Reconciler resolves 09  -> settle (value delivered) or release (refund)
```

Key points:
- New internal ledger account `bills_hold` (system account, no user). Money never disappears — it is either in the customer wallet, the hold account, or settlement.
- Available balance calculation is unchanged in behaviour for the customer: reserved funds are already out of the wallet account, so they cannot double-spend.
- A pending bill shows in the app as "₦500 on hold — awaiting biller", not as a completed spend.
- Every step is idempotent and keyed on the bill reference, so a retry or a duplicated reconciler run cannot double-settle or double-refund.

## 2. Stale-pending timeout with auto-refund

Proposed threshold: **45 minutes** from the receipt's creation.

- Airtime/data normally resolves in seconds; electricity tokens within a few minutes. 45 min is well past any legitimate delay while still short enough that a customer isn't stranded.
- The existing 10-minute reconciler sweep keeps re-querying VFD. On each pass, any receipt older than 45 minutes that is still `09`:
  1. Re-queries VFD one final time.
  2. If still unresolved → release the hold back to the wallet, mark the receipt `refunded (timed out)`, notify the customer.
  3. The reference is recorded in a `stale_refunded` state so that if VFD later delivers value, the reconciler flags it for admin review instead of silently re-debiting.
- Late-delivery safety net: a receipt that was auto-refunded but then reports `00` at VFD raises an admin alert rather than auto re-charging the customer.

## Technical details

- Migration: add `bills_hold` system account to `vestara_accounts`; add `hold_transaction_id`, `settled_at`, `refunded_at`, `timed_out_at` columns to `vfd_sandbox_bill_receipts`; unique guard so one reference can only settle or refund once.
- `supabase/functions/vfd-sandbox-products/index.ts`: split the current single debit into `reserveBillFunds()`, `settleBillHold()` and `releaseBillHold()`; wire them into the pay path and into `reconcile_pending_bills` / `reconcile_pending_bills_cron`.
- Reconciler gains a `STALE_PENDING_MINUTES = 45` constant and a timeout branch, plus counters (`timed_out_refunded`) in its response for monitoring.
- `SandboxBillsTab.tsx`: pending receipts show an "on hold" badge and amount; refunded-by-timeout shows "Refunded — biller did not respond".
- No change to non-bill money paths (transfers, savings, thrift).

## Verification before calling it done

- Simulated `00`, `09`-then-`00`, `09`-then-timeout, and hard-failure paths, each checked for a balanced ledger (debits = credits) and correct wallet balance.
- Confirmed a double-run of the reconciler on the same reference changes nothing the second time.
