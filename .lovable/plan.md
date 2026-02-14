
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

## Phase 2: Contribution Reconciliation (TODO)

### Goals
- Upgrade `contribution-handler` card fallback to use `pending_card` status
- Port verification worker + webhook from test infra to production
- Set up cron job for reconciliation every 2-5 minutes
- Dual confirmation: webhook (primary) + polling (secondary)
- Idempotent ledger entries — only on verified success

### New statuses for cycle_contributions
- `pending_card` — card charged, awaiting confirmation
- `failed` — charge failed
- `unresolved` — pending > 24 hours, flagged for admin

---

## Phase 3: Admin Dashboard Sections (TODO)

### Contributions panel
- Successful / Pending Wallet / Pending Card / Failed / Overdue

### Payment Authorization panel
- Users with active tokens / without tokens / expired tokens

### Withdrawals panel
- Requested / Processing / Paid / Failed

### Manual verification
- Admin can trigger manual Flutterwave verification for pending transactions
