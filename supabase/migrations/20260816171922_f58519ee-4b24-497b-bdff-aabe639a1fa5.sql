DROP POLICY IF EXISTS "Admins can manage test tokens" ON public.user_payment_tokens_test;

REVOKE ALL ON public.user_payment_tokens_test FROM authenticated, anon;
GRANT ALL ON public.user_payment_tokens_test TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_test_payment_tokens(_limit integer DEFAULT 200)
RETURNS TABLE(id uuid, user_id uuid, last_4digits text, card_type text, is_active boolean, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, resource_type, metadata)
  VALUES (auth.uid(), 'admin_view_test_payment_tokens', 'user_payment_tokens_test', jsonb_build_object('limit', _limit));

  RETURN QUERY
  SELECT t.id,
         t.user_id,
         t.last_4digits,
         t.card_type,
         t.is_active,
         t.created_at
  FROM public.user_payment_tokens_test t
  ORDER BY t.created_at DESC
  LIMIT COALESCE(_limit, 200);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_test_payment_tokens(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_test_payment_tokens(integer) TO authenticated;