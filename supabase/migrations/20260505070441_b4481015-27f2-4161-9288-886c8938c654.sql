UPDATE public.vestara_accounts
  SET group_ref = NULL,
      label = COALESCE(label,'') || ' [retired duplicate]'
  WHERE id IN ('67fffe4c-479c-4f96-a908-3e732bfc9e9d','69bbf688-fb7f-466c-9b7a-7230871d92b1');

CREATE UNIQUE INDEX IF NOT EXISTS vestara_accounts_unique_thrift_pool
  ON public.vestara_accounts (group_ref)
  WHERE account_type = 'thrift_pool' AND group_ref IS NOT NULL;