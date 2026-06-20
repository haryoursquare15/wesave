---
name: Money movement model (Hybrid)
description: VFD is source of truth for wallet balance display; Vestara ledger mirrors every move for products/audit
type: feature
---

## Hybrid model (decided 2026-06-20)

- **Wallet balance displayed to users** = live VFD `/account/enquiry` against the user's unique NUBAN. No drift, always matches the bank.
- **Vestara double-entry ledger** still records every wallet movement so Split, Groups, Savings, Locks, audit + reconciliation keep working.
- **All user transfers (intra & inter)** go through VFD `/transfer`. The only short-circuit left is virtual-NUBAN→virtual-NUBAN (toAccount starts with `9`) because those all settle to the shared PLATFORM_POOL_NUBAN at VFD and a pool→pool call would be rejected.
- After a successful VFD `/transfer`, the edge function MUST mirror the move on the Vestara ledger:
  - `vestara_withdraw` for sender (`${reference}-OUT`)
  - If recipient is a Vestara user (`vfd_sandbox_clients.vfd_account_number = toAccount`): `vestara_deposit` for recipient (`${reference}-IN`), insert a `credit` row in `vfd_sandbox_transactions` for their history, refresh their `vfd_user_balances` cache via `ensureBalanceRow`, and post a `transfer_received` notification.
- Reconciler (`vfd_balance_drift_findings`) flags any divergence between VFD balance and Vestara ledger derived balance.
- Reference prefix for transfers defaults to `VFD` (overridable via `VFD_WALLET_NAME` env).
