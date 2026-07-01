UPDATE public.vestara_accounts SET balance = 0, updated_at = now()
WHERE user_id = '7220437f-e4ba-42a4-8e5d-479b5589de0a' AND account_type = 'locked_savings' AND balance = 3000;
DELETE FROM public.vestara_accounts
WHERE user_id = '7220437f-e4ba-42a4-8e5d-479b5589de0a' AND account_type = 'locked_savings' AND balance = 0
  AND NOT EXISTS (SELECT 1 FROM public.vestara_savings s WHERE s.lock_account_id = vestara_accounts.id);