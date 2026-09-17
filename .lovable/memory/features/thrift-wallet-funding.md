---
name: Wallet-funded thrift settlement rule
description: Wallet-mode thrift collects and pays out on the internal ledger inside the corporate pool; no bank transfer leg
type: feature
---

## Rule (2026-09-17, user decision)

For `vfd_sandbox_groups.funding_mode = 'wallet'`:

- **Collection**: debit the member's Vestara wallet, credit the group's thrift pool — internal double-entry only (`collectThriftFromWalletInternal` in `vfd-sandbox-products`). No VFD `/transfer`, because a member NUBAN is a sub-account of the corporate pool (POOL model), so sub-account → pool is a no-op the bank rejects ("Invalid wallet token" / TSQ 108).
- The settlement leg (`<reference>-FUND`) is still opened and marked `confirmed` with `evidence.method = "internal_pool_ledger"`, so `allInboundConfirmed` / `verifyCycleFunding` payout gates keep positive per-member proof.
- **Payout**: debit the thrift pool, credit the recipient's wallet less the platform fee. Payout row gets `bank_status = 'not_required'` so `sweepUnbankedThriftPayouts` never sends a duplicate bank transfer.
- **DDM groups are unchanged**: real NIBSS debit, VFD-confirmed, bank-first, and pool → customer NUBAN transfer on payout.
