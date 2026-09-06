REVOKE EXECUTE ON FUNCTION public.vestara_savings_payout_preview(uuid) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.vestara_savings_payout_preview(uuid) TO service_role;