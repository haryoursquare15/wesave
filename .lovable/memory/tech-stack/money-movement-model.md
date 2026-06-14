---
name: Money movement model
description: Canonical flow for every money-moving action — wallet check, ledger debit, settlement, and VFD/NIBSS interaction
type: feature
---

# Money Movement Model (Vestara)

Every money-moving action MUST follow this order. Deviations break reconciliation.

## Universal rule

1. **Check user available wallet balance first.** Reject early with the action-oriented
   `INSUFFICIENT_BALANCE` payload `{ error, code, required, available, shortfall }` when short.
2. **Debit the user wallet in the Vestara ledger** (atomic, via `vestara_withdraw` /
   `debitWallet` / `debitVestaraForThrift` — never write `vfd_user_balances` directly
   for a debit; mirror caches AFTER the ledger move).
3. **If the move is internal** (intra-Vestara, thrift pool, association wallet,
   split share to internal pool, savings/lock), stop here — the settlement account
   is NOT involved.
4. **If the move is external** (NIBSS inter-bank transfer, bill payment, airtime,
   merchant settlement), the debit leg flows to the Vestara settlement account
   and the credit leg flows through VFD (NIBSS for transfers, biller rails for bills).

## Intra Vestara → Vestara (instant)

`vfd-banking/index.ts` line ~1129 "SANDBOX VIRTUAL→VIRTUAL SHORT-CIRCUIT".
Recipient resolved locally; both legs hit the internal ledger only. NO VFD `/transfer`
call. Settlement account is NOT touched. Settles instantly.

## Inter (NIBSS) transfer

`vfd-banking/index.ts` `handleTransfer`:
- Tier daily cap (rolling 24h window, Tier 1 ₦30k / Tier 2 ₦100k / Tier 3 ∞)
- Wallet balance check
- Debit user wallet (Vestara ledger) → debit settlement → VFD `/transfer` for the
  NIBSS credit leg to the beneficiary bank

## Bill payment

`vfd-sandbox-products/index.ts` `handleBillsPay` (line ~2650):
- Wallet check (`total_balance - locked - savings`) with friendly INSUFFICIENT_BALANCE
- VFD `/bills/pay` for biller delivery
- On success: `vestara_withdraw` RPC (atomic ledger debit + settlement leg) +
  mirror `vfd_user_balances.total_balance` for immediate UI

## SplitPay share

`handlePaySplit` (line ~1822): per-participant `debitWallet(userId, share + fee)`.
When fully funded for a bill-split, `queueSplitBillSettlement` runs the VFD bill
delivery in the background (non-blocking) and the creator gets an immediate
"SplitPay fully funded" notification.

## Thrift / Ajo contributions

`handleContributeGroup` (line ~600): `debitVestaraForThrift` → credit pool. Payout
debits pool, credits recipient wallet. No settlement account involved.

## Savings / Lock funds

- VFD locks (`vfd-banking handleCreateLock` line ~2076): available-balance check →
  insert `vfd_locked_funds` → increment `locked_balance` → ledger entry. Internal only.
- Vestara savings (`vestara-ledger create_savings`): `vestara_create_savings` RPC
  performs the balance check + debit atomically.

## What must NEVER happen

- Calling a VFD endpoint that moves real money WITHOUT a prior wallet balance check.
- Writing `vfd_user_balances` to fake a debit instead of going through the Vestara
  ledger RPCs (would break `syncBalanceCachesFromVestara` reconciliation).
- Touching the settlement account for an intra-Vestara move.
- Generic "Insufficient balance" errors — always use the
  `{ required, available, shortfall }` shape with a guidance sentence.
