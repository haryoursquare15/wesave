ALTER TABLE public.vfd_sandbox_group_members
  ADD COLUMN IF NOT EXISTS payout_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_blocked_reason text,
  ADD COLUMN IF NOT EXISTS payout_withheld_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_settled_at timestamptz;

ALTER TABLE public.vfd_sandbox_group_payouts
  ADD COLUMN IF NOT EXISTS withheld boolean NOT NULL DEFAULT false;

UPDATE public.vfd_sandbox_group_members
  SET payout_blocked = true,
      payout_blocked_reason = 'Outstanding balance owed to the group'
  WHERE outstanding_owed > 0 AND payout_blocked = false;