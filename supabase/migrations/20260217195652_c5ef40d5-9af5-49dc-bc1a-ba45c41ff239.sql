
-- Add 'processing' to transaction_status enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'processing' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_status')) THEN
    ALTER TYPE transaction_status ADD VALUE 'processing';
  END IF;
END$$;

-- Create atomic function to freeze funds for withdrawal (moves available -> locked)
CREATE OR REPLACE FUNCTION public.freeze_wallet_for_withdrawal(
  _user_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _description TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_new_available NUMERIC;
  v_new_locked NUMERIC;
  v_ledger_id UUID;
BEGIN
  SELECT * INTO v_wallet FROM wallets WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF COALESCE(v_wallet.available_balance, 0) < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Idempotency: check if already frozen for this reference
  IF EXISTS (SELECT 1 FROM ledger_entries WHERE reference_id = _reference AND entry_type = 'freeze') THEN
    RETURN json_build_object('success', false, 'error', 'Already frozen for this reference');
  END IF;

  v_new_available := COALESCE(v_wallet.available_balance, 0) - _amount;
  v_new_locked := COALESCE(v_wallet.locked_balance, 0) + _amount;

  INSERT INTO ledger_entries (
    wallet_id, user_id, entry_type, amount,
    balance_before, balance_after,
    locked_before, locked_after,
    reference_type, reference_id, description
  ) VALUES (
    v_wallet.id, _user_id, 'freeze', _amount,
    COALESCE(v_wallet.available_balance, 0), v_new_available,
    COALESCE(v_wallet.locked_balance, 0), v_new_locked,
    'withdrawal', _reference, _description
  ) RETURNING id INTO v_ledger_id;

  UPDATE wallets
  SET available_balance = v_new_available,
      locked_balance = v_new_locked,
      updated_at = now()
  WHERE id = v_wallet.id;

  RETURN json_build_object(
    'success', true,
    'new_available', v_new_available,
    'new_locked', v_new_locked,
    'ledger_id', v_ledger_id
  );
END;
$func$;

-- Confirm withdrawal: deduct from locked balance permanently
CREATE OR REPLACE FUNCTION public.confirm_withdrawal_debit(
  _user_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _description TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_new_locked NUMERIC;
  v_ledger_id UUID;
BEGIN
  SELECT * INTO v_wallet FROM wallets WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM ledger_entries WHERE reference_id = _reference AND entry_type = 'withdrawal_confirmed') THEN
    RETURN json_build_object('success', true, 'duplicate', true);
  END IF;

  v_new_locked := COALESCE(v_wallet.locked_balance, 0) - _amount;
  IF v_new_locked < 0 THEN v_new_locked := 0; END IF;

  INSERT INTO ledger_entries (
    wallet_id, user_id, entry_type, amount,
    balance_before, balance_after,
    locked_before, locked_after,
    reference_type, reference_id, description
  ) VALUES (
    v_wallet.id, _user_id, 'withdrawal_confirmed', _amount,
    COALESCE(v_wallet.available_balance, 0), COALESCE(v_wallet.available_balance, 0),
    COALESCE(v_wallet.locked_balance, 0), v_new_locked,
    'withdrawal', _reference, _description
  ) RETURNING id INTO v_ledger_id;

  UPDATE wallets
  SET locked_balance = v_new_locked,
      updated_at = now()
  WHERE id = v_wallet.id;

  RETURN json_build_object(
    'success', true,
    'new_locked', v_new_locked,
    'ledger_id', v_ledger_id
  );
END;
$func$;

-- Release frozen funds back to available (on transfer failure)
CREATE OR REPLACE FUNCTION public.release_withdrawal_freeze(
  _user_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _description TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_new_available NUMERIC;
  v_new_locked NUMERIC;
  v_ledger_id UUID;
BEGIN
  SELECT * INTO v_wallet FROM wallets WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM ledger_entries WHERE reference_id = _reference AND entry_type = 'unfreeze') THEN
    RETURN json_build_object('success', true, 'duplicate', true);
  END IF;

  v_new_available := COALESCE(v_wallet.available_balance, 0) + _amount;
  v_new_locked := COALESCE(v_wallet.locked_balance, 0) - _amount;
  IF v_new_locked < 0 THEN v_new_locked := 0; END IF;

  INSERT INTO ledger_entries (
    wallet_id, user_id, entry_type, amount,
    balance_before, balance_after,
    locked_before, locked_after,
    reference_type, reference_id, description
  ) VALUES (
    v_wallet.id, _user_id, 'unfreeze', _amount,
    COALESCE(v_wallet.available_balance, 0), v_new_available,
    COALESCE(v_wallet.locked_balance, 0), v_new_locked,
    'withdrawal', _reference, _description
  ) RETURNING id INTO v_ledger_id;

  UPDATE wallets
  SET available_balance = v_new_available,
      locked_balance = v_new_locked,
      updated_at = now()
  WHERE id = v_wallet.id;

  RETURN json_build_object(
    'success', true,
    'new_available', v_new_available,
    'new_locked', v_new_locked,
    'ledger_id', v_ledger_id
  );
END;
$func$;

-- Restrict new RPCs to service_role only
REVOKE EXECUTE ON FUNCTION public.freeze_wallet_for_withdrawal(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_withdrawal_debit(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.release_withdrawal_freeze(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, authenticated, anon;
