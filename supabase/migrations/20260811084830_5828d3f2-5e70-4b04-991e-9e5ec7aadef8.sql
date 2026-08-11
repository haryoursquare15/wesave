DROP POLICY IF EXISTS "Users can view own card tokens" ON public.card_tokens;
DROP POLICY IF EXISTS "Users can view own payment tokens" ON public.user_payment_tokens_test;

REVOKE SELECT ON public.card_tokens FROM authenticated, anon;
REVOKE SELECT ON public.user_payment_tokens_test FROM authenticated, anon;
GRANT ALL ON public.card_tokens TO service_role;
GRANT ALL ON public.user_payment_tokens_test TO service_role;

CREATE OR REPLACE FUNCTION public.get_own_card_tokens()
RETURNS TABLE (
  id uuid,
  card_last4 text,
  card_type text,
  card_status text,
  last_tokenized_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ct.id,
         ct.card_last4,
         ct.card_type,
         ct.card_status,
         ct.last_tokenized_at,
         ct.created_at
  FROM public.card_tokens ct
  WHERE auth.uid() IS NOT NULL AND ct.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_own_card_tokens() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_own_card_tokens() TO authenticated;