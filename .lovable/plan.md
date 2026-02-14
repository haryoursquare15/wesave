

## Post-Tokenization Flow Fix and Recurring Amount Storage

### Problem
1. After completing card tokenization, the user sees the group content in-place but there's no proper page refresh or redirect feedback -- the transition is abrupt.
2. The `card_tokens` table does not store the `recurring_amount` (the contribution amount at the time of tokenization), so there's no record of what amount the token was authorized for.
3. The contribution handler already passes the group's current `contribution_amount` dynamically during card fallback charges, but storing the authorized amount on the token provides an audit trail and enables future validation.

### Changes

#### 1. Database: Add `recurring_amount` column to `card_tokens`
- Add `recurring_amount NUMERIC` column to `card_tokens` to persist the contribution amount used during tokenization.
- This ensures each token has a clear record of the amount it was authorized for.

#### 2. Edge Function: `card-tokenization` (verify action)
- When saving the new token after verification, include `recurring_amount` set to the group's `contribution_amount`.
- Fetch the group's contribution amount during verify (already available from `txData.amount`) and store it alongside the token.

#### 3. Frontend: `TokenizationGate` -- Better post-completion UX
- After successful tokenization, show a brief success state with a checkmark animation before calling `onComplete`.
- Add a short delay (1.5s) with a "Card Authorized -- Joining Group..." message so the transition feels intentional.

#### 4. Frontend: `GroupDetail.tsx` -- Refresh group data on tokenization complete
- When `onComplete` fires from `TokenizationGate`, reload the group data (member count, payout order, contribution status) so the user sees a fully up-to-date group view instead of stale data.

### Technical Details

**Migration SQL:**
```sql
ALTER TABLE public.card_tokens
ADD COLUMN IF NOT EXISTS recurring_amount NUMERIC;

COMMENT ON COLUMN public.card_tokens.recurring_amount
IS 'The contribution amount authorized during card tokenization';
```

**Edge function change (card-tokenization verify action):**
- Add `recurring_amount: txData.amount` (or group's `contribution_amount`) to the `card_tokens` insert.

**TokenizationGate changes:**
- Add a `"success"` step state that shows a checkmark card.
- On verify success, transition to the success step, wait 1.5s, then call `onComplete()`.

**GroupDetail changes:**
- The `onComplete` callback refetches group data, member count, and contribution status before hiding the tokenization gate.

### Files Modified
- `supabase/migrations/[new]_add_recurring_amount.sql` (new)
- `supabase/functions/card-tokenization/index.ts`
- `src/components/TokenizationGate.tsx`
- `src/pages/GroupDetail.tsx`

