CREATE OR REPLACE VIEW public.insights_eligible_users AS
SELECT user_id, created_at AS account_created_at
FROM public.vfd_sandbox_clients c
WHERE user_id IS NOT NULL
  AND account_status = 'active'
  AND COALESCE((metadata ->> 'is_test')::boolean, false) = false
  AND COALESCE(metadata ->> 'account_kind', '') <> ALL (ARRAY['corporate','pool']);