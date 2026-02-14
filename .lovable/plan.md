
# Fix: Store Tokenization Email for Recurring Charges

## Root Cause

Flutterwave's **test sandbox** automatically modifies the customer email during payment. For example:
- You pay with: `llhpremium@gmail.com`
- Flutterwave stores: `ravesb_48d821fc96064411dfd4_llhpremium@gmail.com`

When a recurring (tokenized) charge is attempted, Flutterwave requires the **exact email that was used during tokenization** -- not the original one. The current code fetches the user's profile email (`llhpremium@gmail.com`) and sends that, causing `"Wrong token or email passed"` every time.

## Solution

1. **Add a `charge_email` column** to `user_payment_tokens_test` to store the exact email Flutterwave returned during verification.

2. **Update the `verify_and_save_token` action** in the edge function to extract and save the customer email from the Flutterwave verification response (the `customer.email` field).

3. **Update the `run_recurring_charge` and `cron_auto_charge` actions** to use `tokenData.charge_email` instead of looking up the profile email. Fall back to profile email only if `charge_email` is null.

4. **Update the existing active token** in the database with the correct Flutterwave sandbox email so the current token works immediately without re-tokenizing.

## Technical Details

### Database Change
```sql
ALTER TABLE user_payment_tokens_test
ADD COLUMN charge_email TEXT;
```

Then update the existing record:
```sql
UPDATE user_payment_tokens_test
SET charge_email = 'ravesb_48d821fc96064411dfd4_llhpremium@gmail.com'
WHERE card_token = 'flw-t1nf-87228488ee05ccce4de422aafca2fe39-m03k';
```

### Edge Function Changes (`recurring-test-charge/index.ts`)

**In `verify_and_save_token`**: Save `txData.customer.email` into the new `charge_email` column when inserting the token.

**In `run_recurring_charge`**: Replace the profile email lookup with:
```typescript
const userEmail = tokenData.charge_email || chargeProfile?.email || 'test@wesave.ng';
```

**In `cron_auto_charge`**: Same change -- use `tokenData.charge_email` first, fall back to profile email.

This ensures the exact email Flutterwave expects is always used, whether in test or live mode (where the emails will match naturally).
