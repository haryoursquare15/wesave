
-- Fix: Allow 'fee_collection' wallet type in platform_wallet
ALTER TABLE public.platform_wallet DROP CONSTRAINT platform_wallet_wallet_type_check;
ALTER TABLE public.platform_wallet ADD CONSTRAINT platform_wallet_wallet_type_check 
  CHECK (wallet_type = ANY (ARRAY['revenue'::text, 'reserve'::text, 'escrow'::text, 'fee_collection'::text]));
