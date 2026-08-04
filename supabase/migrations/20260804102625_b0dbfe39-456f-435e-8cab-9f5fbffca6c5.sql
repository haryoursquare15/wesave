ALTER TABLE public.vfd_sandbox_bill_receipts
  ADD COLUMN IF NOT EXISTS delivery_token text,
  ADD COLUMN IF NOT EXISTS delivery_units text,
  ADD COLUMN IF NOT EXISTS delivery_type text,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS delivery_detail jsonb NOT NULL DEFAULT '{}'::jsonb;