CREATE OR REPLACE FUNCTION public.vestara_split_fee_to_revenue(
  _split_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _initiated_by UUID DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _holding_id UUID;
  _revenue_id UUID;
  _holding_balance NUMERIC;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'no_fee');
  END IF;

  SELECT id, balance INTO _holding_id, _holding_balance
  FROM vestara_accounts
  WHERE account_type = 'split_holding' AND split_ref = _split_id
  LIMIT 1;

  IF _holding_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split holding not found');
  END IF;

  IF _holding_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient split holding balance for fee sweep');
  END IF;

  SELECT id INTO _revenue_id
  FROM vestara_accounts
  WHERE account_type = 'revenue' AND user_id IS NULL
  LIMIT 1;

  IF _revenue_id IS NULL THEN
    INSERT INTO vestara_accounts (user_id, account_type, label)
    VALUES (NULL, 'revenue', 'Platform Revenue')
    RETURNING id INTO _revenue_id;
  END IF;

  RETURN vestara_post_transaction(
    'fee', _reference, _amount, _initiated_by,
    jsonb_build_array(
      jsonb_build_object('account_id', _holding_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _revenue_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('split_id', _split_id, 'fee_type', 'splitpay_service_fee')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vestara_split_fee_to_revenue(UUID, NUMERIC, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vestara_split_fee_to_revenue(UUID, NUMERIC, TEXT, UUID, JSONB) TO service_role;