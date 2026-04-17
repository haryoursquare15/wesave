DO $$
DECLARE
  _user_id UUID := 'e492cce8-bfc2-43f3-81d2-6310433f8b5f';
  _wallet_id UUID;
  _settlement_id UUID;
  _result JSONB;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;

  SELECT id INTO _settlement_id FROM vestara_accounts
    WHERE is_system = true AND account_type = 'settlement' LIMIT 1;

  IF _wallet_id IS NULL OR _settlement_id IS NULL THEN
    RAISE EXCEPTION 'Required accounts not found';
  END IF;

  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = 'manual-refund-transfer-5c4840d0') THEN
    RAISE NOTICE 'Refund already applied, skipping.';
    RETURN;
  END IF;

  _result := vestara_post_transaction(
    'reversal'::vestara_tx_type,
    'manual-refund-transfer-5c4840d0',
    3000,
    _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _settlement_id, 'debit', 3000, 'credit', 0),
      jsonb_build_object('account_id', _wallet_id,     'debit', 0,    'credit', 3000)
    ),
    jsonb_build_object(
      'reason', 'VFD returned status 99 (toClient is Mandatory) but client treated truthy response as success',
      'original_reference', 'transfer-5c4840d0',
      'corrects_transaction', '083dd0f7-a659-49f3-bece-d2a78b48344b'
    )
  );

  RAISE NOTICE 'Refund result: %', _result;
END $$;