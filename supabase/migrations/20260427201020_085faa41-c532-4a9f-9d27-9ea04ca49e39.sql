REVOKE ALL ON FUNCTION public.apply_balance_delta(uuid, numeric, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_balance_delta(uuid, numeric, numeric, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.apply_balance_delta(uuid, numeric, numeric, numeric, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_balance_delta(uuid, numeric, numeric, numeric, numeric) TO service_role;