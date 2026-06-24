
ALTER TABLE public.vfd_sandbox_group_members
  ADD COLUMN IF NOT EXISTS mandate_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS mandate_reference text,
  ADD COLUMN IF NOT EXISTS mandate_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_fee_charged_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_fee_amount numeric NOT NULL DEFAULT 0;

-- For groups that already exist with DDM, mark their existing members as authorized
-- so the rollout doesn't break running cycles.
UPDATE public.vfd_sandbox_group_members m
SET mandate_status = 'authorized',
    mandate_reference = COALESCE(m.mandate_reference, 'VES-DDM-AJO-LEGACY'),
    mandate_authorized_at = COALESCE(m.mandate_authorized_at, now())
FROM public.vfd_sandbox_groups g
WHERE g.id = m.group_id
  AND g.funding_mode = 'ddm'
  AND m.mandate_status = 'not_required';
