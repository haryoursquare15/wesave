-- Add NIN and address columns for tiered KYC support
ALTER TABLE public.vfd_sandbox_clients 
ADD COLUMN IF NOT EXISTS nin text,
ADD COLUMN IF NOT EXISTS address text;