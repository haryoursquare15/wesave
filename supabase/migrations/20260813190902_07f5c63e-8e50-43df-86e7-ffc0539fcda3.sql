DO $$
DECLARE r jsonb;
BEGIN
  r := public.guard_credit(NULL, 100::numeric, 'selftest-guard-1', 'selftest', 'unit test', 'manual', '{}'::jsonb);
  RAISE NOTICE 'first: %', r;
  r := public.guard_credit(NULL, 100::numeric, 'selftest-guard-1', 'selftest', 'unit test', 'manual', '{}'::jsonb);
  RAISE NOTICE 'second: %', r;
END $$;
DELETE FROM public.credit_guard_events WHERE source = 'selftest';