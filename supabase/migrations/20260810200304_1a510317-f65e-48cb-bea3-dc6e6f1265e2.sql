CREATE UNIQUE INDEX IF NOT EXISTS vfd_sandbox_clients_account_number_uniq
  ON public.vfd_sandbox_clients (vfd_account_number)
  WHERE vfd_account_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vfd_sandbox_clients_bvn_uniq
  ON public.vfd_sandbox_clients (bvn)
  WHERE bvn IS NOT NULL AND bvn <> '';