REVOKE ALL ON FUNCTION public.admin_assign_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_remove_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_payout_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_payout_atomic(uuid, uuid) TO service_role;