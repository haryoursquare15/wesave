
CREATE OR REPLACE FUNCTION public.process_target_ajo_contribution(
  _group_id UUID,
  _user_id UUID,
  _amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_id UUID;
  v_available NUMERIC;
  v_locked NUMERIC;
  v_tx_ref TEXT;
  v_group RECORD;
  v_new_raised NUMERIC;
  v_target_reached BOOLEAN := FALSE;
BEGIN
  -- 1) Validate group exists and is active
  SELECT id, target_amount, amount_raised, contribution_amount, status
  INTO v_group
  FROM target_ajo_groups
  WHERE id = _group_id
  FOR UPDATE;

  IF v_group IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group not found');
  END IF;

  IF v_group.status NOT IN ('active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group is not active');
  END IF;

  -- 2) Validate membership
  IF NOT EXISTS (
    SELECT 1 FROM target_ajo_memberships
    WHERE group_id = _group_id AND user_id = _user_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an active member');
  END IF;

  -- 3) Lock wallet and check balance
  SELECT id, available_balance, locked_balance
  INTO v_wallet_id, v_available, v_locked
  FROM wallets WHERE user_id = _user_id FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_available < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds');
  END IF;

  -- 4) Generate reference
  v_tx_ref := 'tajo-' || _group_id || '-' || _user_id || '-' || extract(epoch from now())::bigint;

  -- 5) Create ledger DEBIT entry
  INSERT INTO ledger_entries (
    user_id, wallet_id, amount, entry_type, reference_type, reference_id,
    balance_before, balance_after, locked_before, locked_after, description
  ) VALUES (
    _user_id, v_wallet_id, _amount, 'debit', 'target_ajo_contribution', v_tx_ref,
    v_available, v_available - _amount, v_locked, v_locked,
    'Target Ajo contribution to group ' || _group_id
  );

  -- 6) Update wallet
  UPDATE wallets
  SET available_balance = available_balance - _amount, updated_at = now()
  WHERE id = v_wallet_id;

  -- 7) Insert contribution record
  INSERT INTO target_ajo_contributions (group_id, user_id, amount, source, reference, status)
  VALUES (_group_id, _user_id, _amount, 'wallet', v_tx_ref, 'confirmed');

  -- 8) Upsert member contribution tracker
  INSERT INTO target_ajo_member_contributions (group_id, user_id, total_contributed, updated_at)
  VALUES (_group_id, _user_id, _amount, now())
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET total_contributed = target_ajo_member_contributions.total_contributed + _amount, updated_at = now();

  -- 9) Update group amount_raised
  v_new_raised := v_group.amount_raised + _amount;
  UPDATE target_ajo_groups
  SET amount_raised = v_new_raised, updated_at = now()
  WHERE id = _group_id;

  -- 10) Check if target reached
  IF v_new_raised >= v_group.target_amount THEN
    v_target_reached := TRUE;
    UPDATE target_ajo_groups SET status = 'completed', updated_at = now() WHERE id = _group_id;
  END IF;

  -- 11) Transaction record
  INSERT INTO transactions (user_id, type, amount, status, reference, description)
  VALUES (_user_id, 'contribution', _amount, 'completed', v_tx_ref, 'Target Ajo contribution');

  RETURN jsonb_build_object('success', true, 'tx_ref', v_tx_ref, 'target_reached', v_target_reached, 'new_raised', v_new_raised);
END;
$$;
