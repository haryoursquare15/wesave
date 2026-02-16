
-- Fix record_platform_fee: change _source_id from UUID to TEXT
CREATE OR REPLACE FUNCTION public.record_platform_fee(
  _amount numeric,
  _source_type text,
  _source_id text,
  _source_user_id uuid,
  _source_group_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance_before numeric;
  _balance_after numeric;
BEGIN
  -- Get current platform wallet balance
  SELECT available_balance INTO _balance_before
  FROM platform_wallet
  WHERE wallet_type = 'fee_collection'
  FOR UPDATE;

  IF _balance_before IS NULL THEN
    INSERT INTO platform_wallet (wallet_type, available_balance, total_collected)
    VALUES ('fee_collection', 0, 0);
    _balance_before := 0;
  END IF;

  _balance_after := _balance_before + _amount;

  -- Update platform wallet
  UPDATE platform_wallet
  SET available_balance = _balance_after,
      total_collected = total_collected + _amount,
      updated_at = now()
  WHERE wallet_type = 'fee_collection';

  -- Record in platform ledger
  INSERT INTO platform_ledger (
    entry_type, amount, balance_before, balance_after,
    source_type, source_id, source_user_id, source_group_id,
    description
  ) VALUES (
    'fee_credit', _amount, _balance_before, _balance_after,
    _source_type, _source_id, _source_user_id, _source_group_id,
    'Platform fee from ' || _source_type
  );
END;
$$;

-- Drop old UUID-typed overload if it exists
DROP FUNCTION IF EXISTS public.record_platform_fee(numeric, text, uuid, uuid, uuid);
