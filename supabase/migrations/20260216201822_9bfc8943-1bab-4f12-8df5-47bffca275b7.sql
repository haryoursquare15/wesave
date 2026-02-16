
-- Drop the old UUID-typed overloads that conflict with the new TEXT versions
DROP FUNCTION IF EXISTS public.debit_wallet_via_ledger(uuid, numeric, text, uuid, text);
DROP FUNCTION IF EXISTS public.credit_wallet_via_ledger(uuid, numeric, text, uuid, text);
