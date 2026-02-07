-- Fix credit_wallet_atomic to also write a ledger entry for wallet funding
CREATE OR REPLACE FUNCTION public.credit_wallet_atomic(
  _user_id uuid,
  _amount numeric,
  _tx_ref text,
  _description text DEFAULT 'Wallet funding'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
  v_locked NUMERIC;
  v_tx_exists BOOLEAN;
BEGIN
  -- Check for duplicate transaction (idempotency)
  SELECT EXISTS(
    SELECT 1 FROM public.transactions
    WHERE reference = _tx_ref AND status = 'completed'
  ) INTO v_tx_exists;
  
  IF v_tx_exists THEN
    RETURN json_build_object('success', true, 'message', 'Transaction already processed', 'duplicate', true);
  END IF;
  
  -- Get and lock wallet
  SELECT id, coalesce(available_balance, 0), coalesce(locked_balance, 0)
    INTO v_wallet_id, v_old_balance, v_locked
  FROM public.wallets
  WHERE user_id = _user_id
  FOR UPDATE;
  
  -- Create wallet if not exists
  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, available_balance, locked_balance)
    VALUES (_user_id, 0, 0)
    RETURNING id, 0, 0 INTO v_wallet_id, v_old_balance, v_locked;
  END IF;
  
  v_new_balance := v_old_balance + _amount;
  
  -- Record ledger entry (source of truth)
  INSERT INTO public.ledger_entries(
    user_id,
    wallet_id,
    amount,
    balance_before,
    balance_after,
    locked_before,
    locked_after,
    entry_type,
    reference_type,
    reference_id,
    description
  ) VALUES (
    _user_id,
    v_wallet_id,
    _amount,
    v_old_balance,
    v_new_balance,
    v_locked,
    v_locked,
    'credit',
    'wallet_funding',
    _tx_ref,
    _description
  );
  
  -- Credit wallet
  UPDATE public.wallets
  SET available_balance = v_new_balance,
      updated_at = now()
  WHERE id = v_wallet_id;
  
  -- Record or update transaction
  INSERT INTO public.transactions (user_id, type, amount, status, reference, description, wallet_id)
  VALUES (_user_id, 'funding', _amount, 'completed', _tx_ref, _description, v_wallet_id)
  ON CONFLICT (reference) DO UPDATE SET status = 'completed';
  
  RETURN json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'amount_credited', _amount
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in credit_wallet_atomic: % %', SQLERRM, SQLSTATE;
    RETURN json_build_object('success', false, 'error', 'Operation failed');
END;
$$;
