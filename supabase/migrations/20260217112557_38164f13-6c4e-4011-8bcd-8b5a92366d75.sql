
-- Fix: Change platform_ledger.source_id from UUID to TEXT to match the ledger system design
-- that uses TEXT for all reference/source IDs
ALTER TABLE public.platform_ledger ALTER COLUMN source_id TYPE TEXT USING source_id::TEXT;
