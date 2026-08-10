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
  _settlement_id UUID;
  _creator_share NUMERIC := 0;
  _others_share NUMERIC := 0;
  _total NUMERIC;
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
  _total := round(LEAST(_creator_share + _others_share, _holding_balance), 2);

  IF _total <= 0 THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'nothing_to_settle');
  END IF;

  -- Every naira collected for the bill leaves the split holding position and
  -- lands in settlement (the internal mirror of the corporate pool that VFD
  -- actually debits for the vend). The creator is NEVER credited here: any
  -- cash they fronted is squared with a real bank movement, not a ledger gift.
  RETURN vestara_post_transaction(
    'transfer', _reference, _total, _creator_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _holding_id, 'debit', _total, 'credit', 0),
      jsonb_build_object('account_id', _settlement_id, 'debit', 0, 'credit', _total)
    ),
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