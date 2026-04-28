-- 1. Add swap window timestamps
ALTER TABLE public.vfd_sandbox_groups
  ADD COLUMN IF NOT EXISTS swap_window_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_full_at timestamptz;

-- 2. Erase all existing sandbox thrift group data so we can retest cleanly.
-- ON DELETE CASCADE handles members, invites, contributions, payouts, cycles,
-- audit, swaps, invite_links and chat messages.
DELETE FROM public.vfd_sandbox_groups;
