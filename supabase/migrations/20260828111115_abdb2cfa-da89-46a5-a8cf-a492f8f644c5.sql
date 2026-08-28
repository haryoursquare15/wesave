CREATE OR REPLACE FUNCTION public.vestara_thrift_contribute_external(
  _user_id UUID,
  _group_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settlement_id UUID;
  _pool_id UUID;
BEGIN
  SELECT id INTO _settlement_id FROM vestara_accounts
    WHERE is_system = true AND account_type = 'settlement' LIMIT 1;
  IF _settlement_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement account not found');
  END IF;

  SELECT id INTO _pool_id FROM vestara_accounts
    WHERE account_type = 'thrift_pool' AND group_ref = _group_id LIMIT 1;
  IF _pool_id IS NULL THEN
    INSERT INTO vestara_accounts (user_id, account_type, group_ref, label)
    VALUES (NULL, 'thrift_pool', _group_id, 'Thrift Pool')
    RETURNING id INTO _pool_id;
  END IF;

  RETURN vestara_post_transaction(
    'thrift_contribution', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _settlement_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _pool_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('group_id', _group_id, 'funding_source', 'ddm_bank_debit')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.vestara_thrift_contribute_external(UUID, UUID, NUMERIC, TEXT, JSONB) TO service_role;