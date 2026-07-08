
ALTER TABLE public.vestara_products
  ADD COLUMN IF NOT EXISTS sub_account_nuban text;

UPDATE public.vestara_products SET sub_account_nuban = '1048523714' WHERE code = 'vault';
UPDATE public.vestara_products SET sub_account_nuban = '1048523745' WHERE code = 'lockmax';
UPDATE public.vestara_products SET sub_account_nuban = '1048523738' WHERE code = 'upfront_yield';
UPDATE public.vestara_products SET sub_account_nuban = '1048523721' WHERE code = 'goalsave';

ALTER TABLE public.vestara_savings
  ADD COLUMN IF NOT EXISTS sub_account_nuban text,
  ADD COLUMN IF NOT EXISTS sub_account_transfer_ref text,
  ADD COLUMN IF NOT EXISTS sub_account_transferred_at timestamptz;
