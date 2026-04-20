ALTER TABLE public.vfd_sandbox_group_members
  ADD COLUMN IF NOT EXISTS wants_continue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS continue_confirmed_at timestamptz;