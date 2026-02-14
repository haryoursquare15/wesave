
# Recurring Payment Authorization & Reconciliation-Safe Contribution Flow

## Phase 1: Database + Group Join Tokenization Gate ✅ COMPLETE

### Database Changes
- Extended `card_tokens` table with: `first_6digits`, `charge_email`, `card_status` (active/expired/revoked/pending), `group_id`
- Added `tokenization_completed` (boolean) and `terms_accepted_at` (timestamptz) to `group_memberships`
- Added indexes: `idx_card_tokens_user_status`, `idx_card_tokens_group`

### New Edge Function: `card-tokenization`
Actions:
- `initiate` — checks for existing token, returns Flutterwave checkout config
- `verify` — verifies transaction, saves token, credits wallet, marks membership tokenized
- `accept_terms` — for non-auto_debit groups (T&C only)

### New Component: `TokenizationGate`
- Two-step flow: Terms & Conditions → Card Authorization via Flutterwave checkout
- Shown in GroupDetail when `auto_debit=true` AND `tokenization_completed=false`
- Blocks group participation until complete
- Tokenization amount is credited to user's wallet

### Updated Pages
- `GroupDetail.tsx` — renders TokenizationGate before group content for un-tokenized members
- `Invite.tsx` — redirects to group detail (not dashboard) so tokenization gate appears

### Existing Flow Preserved
- Wallet-first contribution logic in `contribution-handler` is **unchanged**
- Existing `card_tokens` entries remain valid (backward compatible)
- `is_active` field kept for backward compatibility alongside new `card_status`

---

## Phase 2: Contribution Reconciliation ✅ COMPLETE

### Database Changes
- Added tracking fields to `cycle_contributions`: `card_charge_status`, `flw_transaction_id`, `card_charged_at`, `card_verified_at`
- Created `pending_card_charges` table for transaction state tracking

### Edge Function: `contribution-handler` (Upgraded)
- Card fallback: if wallet insufficient, charges tokenized card automatically
- Creates `pending_card_charges` record with status `pending`
- No ledger entry until verified

### Edge Function: `contribution-reconciler` (New)
- `reconcile` — cron job every 3 min, verifies pending charges via Flutterwave API
- `webhook` — processes Flutterwave webhook callbacks for card contributions
- `manual_verify` — admin-triggered verification of pending/unresolved charges

### Cron Job
- `reconcile-pending-card-charges` — runs every 3 minutes via pg_cron + pg_net

### Safety
- Idempotent processing via existing contribution check
- Dual confirmation: webhook (primary) + polling (secondary)
- 24-hour timeout → unresolved status for admin review

---

## Phase 3: Admin Dashboard ✅ COMPLETE

### ContributionsTab
- Summary cards: Completed / Pending Wallet / Pending Card / Failed / Unresolved
- Full contributions table with status filters
- Pending card charges table with manual verify button

### PaymentAuthTab
- Summary cards: Active / Expired / Revoked / Pending tokens
- Full token list with card details, status, and group association

### WithdrawalsTab
- Summary cards: Total count / Volume / Processing
- Withdrawal ledger entries with status and references

### Admin Page Updates
- 3 new tabs: Contributions, Payment Auth, Withdrawals
- Gated by `transactions.view` permission
