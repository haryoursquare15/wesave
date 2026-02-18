-- Add 'freeze' and 'unfreeze' to the allowed entry_type values in ledger_entries
ALTER TABLE public.ledger_entries DROP CONSTRAINT ledger_entries_entry_type_check;
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_entry_type_check 
  CHECK (entry_type = ANY (ARRAY['credit'::text, 'debit'::text, 'lock'::text, 'unlock'::text, 'fee'::text, 'reversal'::text, 'freeze'::text, 'unfreeze'::text]));