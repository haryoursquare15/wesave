
ALTER VIEW public.vestara_derived_balances SET (security_invoker = true);
ALTER VIEW public.vestara_transaction_detail SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
