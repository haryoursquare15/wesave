
-- Per-member DDM mandate fields on Target Ajo memberships (mirrors vfd_sandbox_group_members)
ALTER TABLE public.vfd_sandbox_target_members
  ADD COLUMN IF NOT EXISTS contribution_method text DEFAULT 'wallet',
  ADD COLUMN IF NOT EXISTS mandate_status text DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS mandate_reference text,
  ADD COLUMN IF NOT EXISTS mandate_code text,
  ADD COLUMN IF NOT EXISTS mandate_nibss_account text,
  ADD COLUMN IF NOT EXISTS mandate_nibss_message text,
  ADD COLUMN IF NOT EXISTS mandate_payer_bank_code text,
  ADD COLUMN IF NOT EXISTS mandate_payer_account_number text,
  ADD COLUMN IF NOT EXISTS mandate_payer_phone text,
  ADD COLUMN IF NOT EXISTS mandate_payer_email text,
  ADD COLUMN IF NOT EXISTS mandate_payer_address text,
  ADD COLUMN IF NOT EXISTS mandate_start_date date,
  ADD COLUMN IF NOT EXISTS mandate_end_date date,
  ADD COLUMN IF NOT EXISTS mandate_frequency text,
  ADD COLUMN IF NOT EXISTS mandate_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_fee_charged_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS mandate_payload jsonb;

-- Per-savings mandate fields already exist on vestara_savings; ensure mandate_authorized_at exists.
ALTER TABLE public.vestara_savings
  ADD COLUMN IF NOT EXISTS mandate_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_nibss_account text,
  ADD COLUMN IF NOT EXISTS mandate_nibss_message text,
  ADD COLUMN IF NOT EXISTS mandate_reference text,
  ADD COLUMN IF NOT EXISTS mandate_code text,
  ADD COLUMN IF NOT EXISTS mandate_payer_bank_code text,
  ADD COLUMN IF NOT EXISTS mandate_payer_account_number text,
  ADD COLUMN IF NOT EXISTS mandate_payer_phone text,
  ADD COLUMN IF NOT EXISTS mandate_payer_email text,
  ADD COLUMN IF NOT EXISTS mandate_payer_address text,
  ADD COLUMN IF NOT EXISTS mandate_start_date date,
  ADD COLUMN IF NOT EXISTS mandate_end_date date,
  ADD COLUMN IF NOT EXISTS mandate_frequency text,
  ADD COLUMN IF NOT EXISTS mandate_payload jsonb,
  ADD COLUMN IF NOT EXISTS mandate_expires_at timestamptz;

-- Audit table for target DDM mandate lifecycle (parallel to vfd_sandbox_group_mandates)
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_target_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.vfd_sandbox_targets(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL,
  mandate_reference text,
  mandate_code text,
  event_type text NOT NULL,
  event_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vfd_sandbox_target_mandates TO authenticated;
GRANT ALL ON public.vfd_sandbox_target_mandates TO service_role;

ALTER TABLE public.vfd_sandbox_target_mandates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Member or admin can read own target mandate events"
  ON public.vfd_sandbox_target_mandates
  FOR SELECT TO authenticated
  USING (
    member_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.vfd_sandbox_targets t
      WHERE t.id = vfd_sandbox_target_mandates.target_id
        AND t.admin_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_target_mandates_target ON public.vfd_sandbox_target_mandates(target_id);
CREATE INDEX IF NOT EXISTS idx_target_mandates_member ON public.vfd_sandbox_target_mandates(member_user_id);
CREATE INDEX IF NOT EXISTS idx_target_members_mandate_status ON public.vfd_sandbox_target_members(target_id, mandate_status);
