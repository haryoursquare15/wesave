CREATE OR REPLACE FUNCTION public.vestara_sync_user_balance_cache(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet numeric := 0;
  _locked numeric := 0;
  _savings numeric := 0;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('skipped', true); END IF;

  SELECT
    COALESCE(SUM(balance) FILTER (WHERE account_type = 'wallet'), 0),
    COALESCE(SUM(balance) FILTER (WHERE account_type = 'locked_savings'), 0),
    COALESCE(SUM(balance) FILTER (WHERE account_type = 'accrued_interest'), 0)
  INTO _wallet, _locked, _savings
  FROM vestara_accounts
  WHERE user_id = _user_id AND is_system = false;

  -- available_balance is a GENERATED column (total - locked - savings) and
  -- must never be written explicitly.
  INSERT INTO vfd_user_balances (user_id, total_balance, locked_balance, savings_balance, last_synced_at, updated_at)
  VALUES (_user_id, _wallet + _locked + _savings, _locked, _savings, now(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    total_balance   = EXCLUDED.total_balance,
    locked_balance  = EXCLUDED.locked_balance,
    savings_balance = EXCLUDED.savings_balance,
    last_synced_at  = now(),
    updated_at      = now();

  UPDATE public.wallets
     SET available_balance = _wallet, locked_balance = _locked, updated_at = now()
   WHERE user_id = _user_id;

  RETURN jsonb_build_object('wallet', _wallet, 'locked', _locked, 'savings', _savings);
END;
$$;