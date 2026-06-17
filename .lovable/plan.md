# Plan: Ajo sweep fix + Transfer preview + Tiered fees

## 1. Investigate & fix "Test Test" Ajo group payout sweep

**Goal:** Find why the platform did not debit participant wallets and credit the group wallet → first payee.

**Steps:**
- Query the DB for the "Test Test" target-ajo / thrift group: members, balances, scheduled contribution, payout rotation, last cron run.
- Inspect `auto-contribution` / `target-ajo-auto-contribution` edge functions and the RPC used (`process_target_ajo_contribution` or thrift equivalent).
- Identify the failure: likely missing scheduler trigger, RPC erroring on tier/limit check, or payout function not invoked when target reached.
- Patch the function/RPC so:
  - Each due cycle debits each member's wallet (ledger entry) and credits the group wallet.
  - When cycle closes, payout the next-in-rotation member (credit their wallet, debit group wallet).
- Backfill the missed run for "Test Test" group manually via supabase--insert (one-shot reconciliation).

## 2. Universal Transfer Preview modal

**Goal:** Before the `<TransactionPinGate>` opens for any transfer, show a confirmation sheet.

**Steps:**
- Add `<TransferPreviewSheet>` component showing: recipient name + bank + masked account, amount, transfer fee (₦20 or free), stamp duty (₦50 if inter), total debit, narration.
- Wire into `SandboxTransfer.tsx` (intra + inter) and `useSplitPay` / bill payment confirmation paths.
- Flow: user clicks "Send" → preview opens → "Confirm" → PIN gate → execute.

## 3. Interbank fee + stamp duty engine

**Tiers (by sender wallet balance at time of transfer):**

| Tier | Balance | Transfer fee | Free quota | Stamp duty |
|------|---------|--------------|------------|------------|
| 1 | < ₦10K | ₦20 per trf | none | ₦50 |
| 2 | ₦10K–₦49.9K | ₦20 after 5 free | 5 / month | ₦50 |
| 3 | ₦50K–₦199K | ₦20 after 15 free | 15 / month | ₦50 |
| 4 | ≥ ₦200K | Free | Unlimited | ₦50 |

Notes:
- Stamp duty (₦50) applies to **every interbank (inter) transfer**, regardless of tier.
- Intra-Vestara transfers: no fee, no stamp duty.
- Counter resets monthly per user.

**DB changes (migration):**
- New table `public.transfer_fee_counters` (user_id, month_key, inter_count). RLS: user reads own; service_role writes.
- New table `public.vestara_fee_ledger` (id, user_id, tx_reference, fee_type ['transfer_fee'|'stamp_duty'], amount, created_at). RLS: user reads own; service_role writes.
- Add GRANTs for both.

**Backend (`vfd-banking` edge function):**
- In the `transfer` action, when `transferType === 'inter'`:
  1. Compute sender's current wallet tier.
  2. Look up `transfer_fee_counters` for current month; decide if transfer fee = ₦20 or ₦0 based on tier quota.
  3. Stamp duty = ₦50.
  4. Pre-check: `wallet >= amount + fee + stamp_duty`. Else friendly `INSUFFICIENT_BALANCE` with shortfall.
  5. Execute VFD transfer. On success: debit wallet for fee + stamp duty via ledger, insert into `vestara_fee_ledger`, increment counter.
  6. Return `{ fee, stamp_duty, total_debit }` so the receipt can display them.

**Client:**
- Preview modal calls a lightweight `quote_transfer` action (or computes locally from `wallet.available_balance` + counter fetch) to show fee + stamp duty before PIN.
- Add `quote_transfer` action in `vfd-banking` returning `{ fee, stamp_duty, free_remaining, tier }`.

## 4. Verification

- DB query confirms `transfer_fee_counters` increments and `vestara_fee_ledger` rows created.
- Test inter transfer for each tier in sandbox; confirm correct fee.
- Test intra transfer: no fee, no preview-shown duty.
- Re-run "Test Test" Ajo cycle to confirm sweep + payout works end-to-end.

## Open question
The fee tier is based on sender's wallet balance **at time of transfer** — confirm this (vs. KYC tier). Your table says "bal" so I'll use wallet balance unless you say otherwise.

Approve and I'll start with (1) investigation + (3) migration in parallel, then (2) preview UI.
