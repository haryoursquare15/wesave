
ALTER TABLE public.vfd_sandbox_group_members
  ADD COLUMN IF NOT EXISTS mandate_payload jsonb;
