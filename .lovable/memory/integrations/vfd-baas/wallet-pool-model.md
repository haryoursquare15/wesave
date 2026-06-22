---
name: VFD wallet = POOL implementation
description: Every user NUBAN is a sub-account of the corporate pool; transfers must carry uniqueSenderAccountId
type: feature
---

## Decision (2026-06-22)

VFD provisions Vestara on the **POOL** wallet model (docs §3.1):
- Every user's unique NUBAN is a **sub-account** of the corporate pool account.
- Inflows to a sub-account are swept to the corporate account; outward charges debit the corporate.
- The displayed "wallet balance" cannot come from `/account/enquiry` on the sub-account alone — under pure POOL the sub-account reflects flow, not standing balance.

## Implementation rules

1. **`uniqueSenderAccountId` is mandatory on every `/transfer` call.** `vfd-banking` auto-populates it as the user's own NUBAN (`displayFromAccount`). Without it, the receiving bank sees the corporate pool as the sender.
2. **Balance display:** the hybrid model (VFD = display truth) needs revisiting under POOL. Internal Vestara ledger derived balance is the safer source of truth; reconcile periodically against the corporate pool total, not per sub-account.
3. **PLATFORM_POOL_NUBAN** (`1001695610`) is the corporate account; all sub-accounts roll up into it.
4. Virtual NUBANs (`9*`) already swap to PLATFORM_POOL_NUBAN for the VFD call and keep their virtual number as `uniqueSenderAccountId`.

