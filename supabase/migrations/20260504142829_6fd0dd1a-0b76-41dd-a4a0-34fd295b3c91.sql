-- Deduplicate active contribution cycles: keep oldest per (group_id, cycle_number), mark others as 'cancelled'
WITH ranked AS (
  SELECT id, group_id, cycle_number, status,
         ROW_NUMBER() OVER (PARTITION BY group_id, cycle_number, status ORDER BY created_at ASC) AS rn
  FROM public.vfd_sandbox_contribution_cycles
  WHERE status = 'active'
)
DELETE FROM public.vfd_sandbox_contribution_cycles
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Prevent future duplicates: only one active cycle per group at a time
CREATE UNIQUE INDEX IF NOT EXISTS vfd_sandbox_one_active_cycle_per_group
  ON public.vfd_sandbox_contribution_cycles (group_id)
  WHERE status = 'active';