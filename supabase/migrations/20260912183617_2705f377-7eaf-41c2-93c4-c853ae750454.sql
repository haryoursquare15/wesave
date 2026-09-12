revoke all on function public.spendlock_run_detection(uuid) from public, anon;
revoke all on function public.spendlock_get_insights() from public, anon;
revoke all on function public.spendlock_update_bill(uuid, text, text) from public, anon;
revoke all on function public.spendlock_resolve_suggestion(uuid, text) from public, anon;
grant execute on function public.spendlock_run_detection(uuid) to authenticated, service_role;
grant execute on function public.spendlock_get_insights() to authenticated;
grant execute on function public.spendlock_update_bill(uuid, text, text) to authenticated;
grant execute on function public.spendlock_resolve_suggestion(uuid, text) to authenticated;