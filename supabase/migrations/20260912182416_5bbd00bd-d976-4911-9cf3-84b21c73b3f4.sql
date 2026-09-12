
revoke execute on function public.budget_get_status() from public, anon;
revoke execute on function public.budget_set_rule(text, numeric, int, text, int) from public, anon;
revoke execute on function public.budget_set_status(text) from public, anon;
revoke execute on function public.budget_delete_rule() from public, anon;
revoke execute on function public.budget_request_unlock(numeric, text) from public, anon;
revoke execute on function public.budget_cancel_unlock(uuid) from public, anon;
