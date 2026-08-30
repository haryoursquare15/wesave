CREATE OR REPLACE FUNCTION public.vestara_post_confirmed_thrift_collection(
  _user_id UUID,
  _group_id UUID,
  _amount NUMERIC,
  _amount_kobo BIGINT,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _posted JSONB;
  _tx_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_reference, 0));

  SELECT id INTO _tx_id
  FROM public.vestara_transactions
  WHERE reference = _reference;

  IF _tx_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_posted', true, 'transaction_id', _tx_id);
  END IF;

  _posted := public.vestara_thrift_contribute_external(
    _user_id,
    _group_id,
    _amount,
    _reference,
    _metadata
  );

  IF COALESCE((_posted->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN _posted;
  END IF;

  UPDATE public.vfd_sandbox_groups
  SET pool_ledger_balance = COALESCE(pool_ledger_balance, 0) + _amount_kobo,
      total_contributed_kobo = COALESCE(total_contributed_kobo, 0) + _amount_kobo,
      updated_at = now()
  WHERE id = _group_id;

  RETURN _posted || jsonb_build_object('already_posted', false);
END;
$$;

REVOKE ALL ON FUNCTION public.vestara_post_confirmed_thrift_collection(UUID, UUID, NUMERIC, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vestara_post_confirmed_thrift_collection(UUID, UUID, NUMERIC, BIGINT, TEXT, JSONB) TO service_role;