
-- Fix: Add 'fee_credit' to platform_ledger entry_type constraint
ALTER TABLE public.platform_ledger DROP CONSTRAINT platform_ledger_entry_type_check;
ALTER TABLE public.platform_ledger ADD CONSTRAINT platform_ledger_entry_type_check 
  CHECK (entry_type = ANY (ARRAY['fee_collected'::text, 'settlement'::text, 'refund'::text, 'adjustment'::text, 'fee_credit'::text]));
