REVOKE SELECT ON public.account_locks FROM authenticated;
REVOKE SELECT ON public.account_locks FROM anon;

DO $$
DECLARE col text; cols text := '';
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='account_locks' AND column_name <> 'unlock_code'
    ORDER BY ordinal_position
  LOOP
    cols := cols || quote_ident(col) || ',';
  END LOOP;
  cols := rtrim(cols, ',');
  EXECUTE format('GRANT SELECT (%s) ON public.account_locks TO authenticated', cols);
END $$;

GRANT ALL ON public.account_locks TO service_role;