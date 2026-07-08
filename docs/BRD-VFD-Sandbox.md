# Business Requirements Document — Vestara VFD Sandbox

**Version:** 1.0
**Date:** July 8, 2026
**Owner:** Vestara Product & Engineering
**Status:** Approved for Pilot

---

## 1. Executive Summary

The Vestara VFD Sandbox is an isolated, fully-functional replica of the production Vestara experience, powered by VFD Microfinance Bank's Banking-as-a-Service (BaaS) **sandbox** APIs. It runs at `/vfd-sandbox` with its own authentication session, a dedicated set of database tables (all prefixed `vfd_sandbox_*`), and its own edge functions. It exists so that Vestara can validate every money-moving flow end-to-end against a real banking rail before enabling production traffic.

## 2. Business Objectives

1. **Validate VFD integration end-to-end** — KYC, NUBAN provisioning, inward/outward transfers, mandates, and reconciliation — without touching production customer funds.
2. **Provide a safe QA environment** for internal testers, pilot customers, and compliance reviewers.
3. **Onboard pilot customers** onto a production-shaped experience using disposable test identities.
4. **De-risk the POOL wallet model** where every user NUBAN is a sub-account of the corporate pool (`1001695610`).
5. **Serve as a permanent training and demo surface** for support, operations, and partners.

## 3. Scope

### 3.1 In Scope
- Independent sandbox authentication (separate Supabase storage key, auto-confirmed signups).
- VFD sandbox KYC flow with tiered limits (Tier 1 → Tier 3).
- Unique NUBAN provisioning per user as sub-accounts of corporate pool NUBAN `1001695610`.
- Wallet funding, intra-Vestara transfers, interbank (NIBSS) transfers with fees + stamp duty.
- Products: Lock Funds, Goal Savings 2.0 (with DDM), Vestara Savings, Target Ajo, Thrift Groups, Split Pay, Crowdfunding, Bills, Virtual Cards.
- Notifications: Web Push, Realtime popups, branded transactional email.
- Admin tooling: audit, reconciliation, rate configs, webhook DLQ.
- Immutable double-entry ledger for audit and drift detection.

### 3.2 Out of Scope
- Real customer funds or live merchant settlement.
- Production email domain and regulatory reporting.
- Any data cross-contamination with the main Vestara production schema.

## 4. Users & Roles

| Role | Description |
|------|-------------|
| Sandbox Tester | Signs up with a throwaway email; auto-confirmed. |
| Pilot Customer | Real user testing the flow with test funds. |
| Vestara Admin | Reviews audits, DLQ, rate configs, reconciliation. |
| Support | Reads sandbox transactions to reproduce issues. |

## 5. Functional Requirements

### 5.1 Authentication
- Isolated Supabase session (`sb-sandbox-auth` storage key).
- Signup auto-confirmed via `sandbox-auto-confirm` edge function.
- Inactivity sign-out: 15 min foreground / 30 min background.
- Forgot / reset password flows scoped to `/vfd-sandbox/*`.

### 5.2 KYC & Account Provisioning
- VFD sandbox KYC (BVN, NIN, selfie, document upload).
- Tiered limits enforced server-side.
- Unique NUBAN provisioned per user as sub-account of corporate pool.
- Virtual NUBAN fallback (`9*` prefix) when VFD provisioning is unavailable.

### 5.3 Wallet & Transfers
- **Balance display:** live VFD `/account/enquiry` is the source of truth for the displayed wallet balance.
- **Ledger:** immutable double-entry `vestara_ledger_entries` mirrors every move for audit + product logic.
- **Intra-Vestara transfers:** free, no stamp duty (bank code `999999` or recipient NUBAN starts with `9`).
- **Interbank transfers:** tiered fee + ₦50 stamp duty per transfer.

| Tier | Wallet balance | Fee | Free quota | Stamp duty |
|------|----------------|-----|------------|------------|
| 1 | < ₦10k | ₦20 | 0 | ₦50 |
| 2 | ₦10k – ₦49,999 | ₦20 after 5 | 5/mo | ₦50 |
| 3 | ₦50k – ₦199,999 | ₦20 after 15 | 15/mo | ₦50 |
| 4 | ≥ ₦200k | Free | Unlimited | ₦50 |

- `uniqueSenderAccountId` is mandatory on every VFD `/transfer` call (POOL model).
- Upstream 5xx/HTML responses are retried up to 2× with 400 ms backoff; friendly error messages surfaced (no misleading "token" errors).
- All money-moving flows are gated by `<TransactionPinGate>`.

### 5.4 Products
- **Lock Funds** — time-locked savings; early break penalty.
- **Goal Savings 2.0** — recurring commitment savings with VFD Direct Debit Mandate; interest at maturity; no early withdrawal.
- **Vestara Savings** — 4-product family with daily interest.
- **Target Ajo** — rotating peer savings with voting-based early withdrawal.
- **Thrift Groups** — group contribution with turn-based payouts.
- **Split Pay** — bill delivery + non-blocking settlement; auto-grow capacity.
- **Crowdfunding / Goal Campaigns** — public inflow via `vfd-campaign-inflow-webhook`; credits campaign on VFD inflow match.
- **Bills** — airtime, data, cable, electricity via VFD bill APIs.
- **Virtual Cards** — issuance, funding, and tokenization gate.

### 5.5 Notifications
- Web Push (service worker).
- Supabase Realtime popups for in-app events.
- Branded transactional email via `notify.vestara.ng` and `send-transactional-email`.

### 5.6 Reconciliation & Audit
- `vfd-pool-reconciler` runs outside VFD's EOD window (00:00 WAT).
- `vfd_balance_drift_findings` flags divergence between VFD balance and Vestara ledger.
- Admin tabs: audit logs, DLQ, rate configs, platform revenue.

## 6. Non-Functional Requirements
- **Isolation:** all sandbox data in `vfd_sandbox_*` tables; no cross-contamination with production.
- **Security:** RLS on every public table; roles stored in `user_roles`; `has_role()` SECURITY DEFINER.
- **Reliability:** graceful handling of VFD 5xx / HTML responses with retries and user-friendly messages.
- **Observability:** every VFD call logged; edge function logs surfaced to admin.
- **Mobile-first UX:** 44 px touch targets, 100dvh, PiggyVest-style minimal UI.

## 7. Data Model (Highlights)
- `vfd_sandbox_clients` — KYC + NUBAN per sandbox user.
- `vfd_sandbox_transactions` — credits/debits for user history.
- `vfd_user_balances` — cached balance snapshot.
- `vestara_ledger_entries` — immutable double-entry ledger.
- `vestara_fee_ledger` — fee_type ∈ {`transfer_fee`, `stamp_duty`, `mandate_setup`}.
- `vestara_savings`, `vestara_products`, `vestara_rate_configs`.
- `vfd_savings_debit_schedule`, `vfd_savings_mandate_events` (Goal Savings 2.0).
- `transfer_fee_counters` — free-quota counter per user per month.

## 8. Integrations
- **VFD BaaS** — sandbox base URL, corporate pool `1001695610`.
- **Lovable Cloud** — Supabase-backed backend, edge functions, Realtime, Storage.
- **Email** — branded templates via `notify.vestara.ng`.
- **Web Push** — service worker + VAPID keys.

## 9. Roadmap

| Milestone | Status |
|-----------|--------|
| Auth + KYC + wallet + transfers | ✅ Live |
| Products (Lock, Savings, Ajo, Groups, Split, Crowdfunding, Bills) | ✅ Live |
| Notifications (Push, Realtime, Email) | ✅ Live |
| Goal Savings 2.0 with DDM | 🟡 In progress |
| Virtual card enhancements | 🔴 Planned |
| Automated regression suite | 🔴 Planned |

## 10. Assumptions & Constraints
- VFD sandbox is best-effort; occasional 5xx/HTML is expected and handled.
- All users share a single corporate pool NUBAN; sub-account balances derive from ledger + VFD enquiry.
- No stored PII in sandbox beyond what VFD sandbox KYC requires.
- Sandbox is **not** covered by production SLAs.

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| VFD sandbox downtime | Retries + friendly errors; ledger stays consistent via reversal. |
| Drift between VFD and Vestara ledger | Reconciler + `vfd_balance_drift_findings` alerts. |
| Test data leakage into production | Separate tables, separate storage key, separate edge functions. |
| Misleading error messages | Upstream status mapped to accurate user copy. |

## 12. Acceptance Criteria
- A new tester can sign up, complete KYC, fund a NUBAN, transfer intra- and interbank, use every product, and see accurate balances.
- Every money movement produces matching ledger entries and, where applicable, fee-ledger entries.
- Admin can audit, reconcile, and export any transaction.
- No sandbox action affects production data.

---

*Document owner: Vestara Product & Engineering. For revisions, update this file and bump the version.*
