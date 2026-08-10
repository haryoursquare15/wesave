CREATE OR REPLACE FUNCTION public.vestara_split_settle(
  _split_id uuid,
  _creator_id uuid,
  _reference text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _holding_id UUID;
  _holding_balance NUMERIC;
  _creator_wallet_id UUID;
  _settlement_id UUID;
  _creator_share NUMERIC := 0;
  _others_share NUMERIC := 0;
  _total NUMERIC;
  _legs JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _reference) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT id, balance INTO _holding_id, _holding_balance
  FROM vestara_accounts
  WHERE account_type = 'split_holding' AND split_ref = _split_id
  LIMIT 1;
  IF _holding_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split holding not found');
  END IF;

  SELECT id INTO _creator_wallet_id FROM vestara_accounts
    WHERE user_id = _creator_id AND account_type = 'wallet' LIMIT 1;
  IF _creator_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creator wallet not found');
  END IF;

  SELECT id INTO _settlement_id FROM vestara_accounts
    WHERE is_system = true AND account_type = 'settlement' LIMIT 1;
  IF _settlement_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement account missing');
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE user_id = _creator_id), 0),
    COALESCE(SUM(amount) FILTER (WHERE user_id <> _creator_id), 0)
  INTO _creator_share, _others_share
  FROM vfd_sandbox_split_participants
  WHERE split_id = _split_id AND status = 'paid';

  _creator_share := round(_creator_share, 2);
  _others_share := round(_others_share, 2);
  _total := _creator_share + _others_share;

  IF _total <= 0 THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'nothing_collected');
  END IF;
  IF _holding_balance < _total THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient split holding balance',
                              'holding_balance', _holding_balance, 'required', _total);
  END IF;

  _legs := jsonb_build_array(
    jsonb_build_object('account_id', _holding_id, 'debit', _total, 'credit', 0)
  );
  IF _others_share > 0 THEN
    _legs := _legs || jsonb_build_array(
      jsonb_build_object('account_id', _creator_wallet_id, 'debit', 0, 'credit', _others_share));
  END IF;
  IF _creator_share > 0 THEN
    _legs := _legs || jsonb_build_array(
      jsonb_build_object('account_id', _settlement_id, 'debit', 0, 'credit', _creator_share));
  END IF;

  RETURN vestara_post_transaction(
    'transfer', _reference, _total, _creator_id, _legs,
    _metadata || jsonb_build_object(
      'source', 'split_bill_settle',
      'split_id', _split_id,
      'creator_share', _creator_share,
      'participants_share', _others_share)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vestara_split_settle(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vestara_split_settle(uuid, uuid, text, jsonb) TO service_role;