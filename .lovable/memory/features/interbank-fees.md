---
name: Interbank fees
description: Tiered transfer fee + stamp duty rules charged on every interbank (NIBSS) transfer
type: feature
---
Interbank transfer fee tiers (by sender wallet balance at time of transfer):

| Tier | Wallet balance      | Transfer fee     | Free quota         | Stamp duty |
|------|---------------------|------------------|--------------------|------------|
| 1    | < ₦10,000           | ₦20 per transfer | none               | ₦50        |
| 2    | ₦10k – ₦49,999      | ₦20 after 5 free | 5 per month        | ₦50        |
| 3    | ₦50k – ₦199,999     | ₦20 after 15 free| 15 per month       | ₦50        |
| 4    | ≥ ₦200,000          | Free             | Unlimited          | ₦50        |

- Stamp duty (₦50) is charged on EVERY interbank transfer regardless of tier.
- Intra-Vestara transfers (bank code 999999 OR recipient NUBAN starts with "9"): no fee, no stamp duty.
- Counter `transfer_fee_counters(user_id, month_key, inter_count)` increments per successful interbank transfer; month_key is WAT `YYYY-MM`.
- All fees recorded in `vestara_fee_ledger(user_id, fee_type, amount, reference, tx_reference)`. fee_type ∈ {`transfer_fee`,`stamp_duty`}.
- Implementation lives in `supabase/functions/vfd-banking/index.ts`:
  - `quoteTransferFees()` → returns the full quote (used by `quote_transfer` action + the preview modal).
  - `chargeTransferFees()` → debits sender via `vestara_withdraw` after VFD confirms success.
- Client preview: `src/components/vfd-sandbox/TransferPreviewSheet.tsx` opens before `<TransactionPinGate>` and shows amount + fees + total debit + insufficient-balance guard.
