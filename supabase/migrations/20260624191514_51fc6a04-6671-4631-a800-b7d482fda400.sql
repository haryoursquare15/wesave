-- 1. Per-member DDM detail columns
ALTER TABLE public.vfd_sandbox_group_members
  ADD COLUMN IF NOT EXISTS contribution_method TEXT NOT NULL DEFAULT 'wallet',
  ADD COLUMN IF NOT EXISTS mandate_code TEXT,
  ADD COLUMN IF NOT EXISTS mandate_nibss_account TEXT,
  ADD COLUMN IF NOT EXISTS mandate_nibss_message TEXT,
  ADD COLUMN IF NOT EXISTS mandate_payer_bank_code TEXT,
  ADD COLUMN IF NOT EXISTS mandate_payer_account_number TEXT,
  ADD COLUMN IF NOT EXISTS mandate_payer_phone TEXT,
  ADD COLUMN IF NOT EXISTS mandate_payer_email TEXT,
  ADD COLUMN IF NOT EXISTS mandate_payer_address TEXT,
  ADD COLUMN IF NOT EXISTS mandate_start_date DATE,
  ADD COLUMN IF NOT EXISTS mandate_end_date DATE,
  ADD COLUMN IF NOT EXISTS mandate_frequency TEXT,
  ADD COLUMN IF NOT EXISTS mandate_created_at TIMESTAMPTZ;

-- Constrain contribution_method
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vfd_sandbox_group_members_contribution_method_chk'
  ) THEN
    ALTER TABLE public.vfd_sandbox_group_members
      ADD CONSTRAINT vfd_sandbox_group_members_contribution_method_chk
      CHECK (contribution_method IN ('wallet','direct_debit'));
  END IF;
END $$;

-- 2. Audit table
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_group_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thrift_group_id UUID NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL,
  mandate_reference TEXT,
  mandate_code TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created','authorized','status_checked','debit_triggered',
    'debit_success','debit_failed','cancelled','failed'
  )),
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_group_mandates_group
  ON public.vfd_sandbox_group_mandates(thrift_group_id);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_group_mandates_user
  ON public.vfd_sandbox_group_mandates(member_user_id);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_group_mandates_ref
  ON public.vfd_sandbox_group_mandates(mandate_reference);

GRANT SELECT ON public.vfd_sandbox_group_mandates TO authenticated;
GRANT ALL ON public.vfd_sandbox_group_mandates TO service_role;

ALTER TABLE public.vfd_sandbox_group_mandates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members and admins can view mandate audit"
  ON public.vfd_sandbox_group_mandates;
CREATE POLICY "Members and admins can view mandate audit"
  ON public.vfd_sandbox_group_mandates
  FOR SELECT TO authenticated
  USING (
    member_user_id = auth.uid()
    OR public.is_any_admin(auth.uid())
  );
