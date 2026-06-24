
ALTER TABLE public.vfd_sandbox_groups
  ADD COLUMN IF NOT EXISTS funding_mode text NOT NULL DEFAULT 'wallet',
  ADD COLUMN IF NOT EXISTS mandate_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS mandate_reference text;

ALTER TABLE public.vfd_sandbox_groups
  DROP CONSTRAINT IF EXISTS vfd_sandbox_groups_funding_mode_chk;
ALTER TABLE public.vfd_sandbox_groups
  ADD CONSTRAINT vfd_sandbox_groups_funding_mode_chk
  CHECK (funding_mode IN ('wallet','ddm'));

ALTER TABLE public.vfd_sandbox_groups
  DROP CONSTRAINT IF EXISTS vfd_sandbox_groups_mandate_status_chk;
ALTER TABLE public.vfd_sandbox_groups
  ADD CONSTRAINT vfd_sandbox_groups_mandate_status_chk
  CHECK (mandate_status IN ('not_required','pending','authorized','revoked','failed'));

ALTER TABLE public.vfd_sandbox_targets
  ADD COLUMN IF NOT EXISTS funding_mode text NOT NULL DEFAULT 'wallet',
  ADD COLUMN IF NOT EXISTS mandate_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS mandate_reference text;

ALTER TABLE public.vfd_sandbox_targets
  DROP CONSTRAINT IF EXISTS vfd_sandbox_targets_funding_mode_chk;
ALTER TABLE public.vfd_sandbox_targets
  ADD CONSTRAINT vfd_sandbox_targets_funding_mode_chk
  CHECK (funding_mode IN ('wallet','ddm'));

ALTER TABLE public.vfd_sandbox_targets
  DROP CONSTRAINT IF EXISTS vfd_sandbox_targets_mandate_status_chk;
ALTER TABLE public.vfd_sandbox_targets
  ADD CONSTRAINT vfd_sandbox_targets_mandate_status_chk
  CHECK (mandate_status IN ('not_required','pending','authorized','revoked','failed'));
