REVOKE ALL ON FUNCTION public.vestara_bill_settle(text, jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vestara_bill_settle(text, jsonb, numeric) TO service_role;