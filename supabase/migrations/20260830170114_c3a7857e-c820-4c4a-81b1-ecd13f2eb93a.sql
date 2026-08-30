CREATE UNIQUE INDEX IF NOT EXISTS uq_vfd_sandbox_group_contributions_member_cycle
ON public.vfd_sandbox_group_contributions (group_id, user_id, cycle_number);