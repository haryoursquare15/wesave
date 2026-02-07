-- 1) Alter column type first
ALTER TABLE public.ledger_entries ALTER COLUMN reference_id TYPE TEXT USING reference_id::text;

-- 2) Drop old function signature
DROP FUNCTION IF EXISTS public.process_contribution_ledger_atomic(uuid, uuid, numeric);

-- 3) Recreate the function returning JSONB
CREATE FUNCTION public.process_contribution_ledger_atomic(
  _user_id UUID,
  _group_id UUID,
  _amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_available NUMERIC;
  v_locked NUMERIC;
  v_cycle_id UUID;
  v_tx_ref TEXT;
  v_active_count INT;
  v_contributed_count INT;
  v_all_contributed BOOLEAN;
  v_payout_result JSONB;
  v_membership_id UUID;
BEGIN
  -- 1) Find active cycle
  SELECT id INTO v_cycle_id FROM contribution_cycles
  WHERE group_id = _group_id AND status = 'active' LIMIT 1;

  IF v_cycle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active cycle');
  END IF;

  -- 2) Check membership & contribution status
  SELECT id INTO v_membership_id FROM group_memberships
  WHERE user_id = _user_id AND group_id = _group_id AND status = 'active' LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an active member');
  END IF;

  IF EXISTS (SELECT 1 FROM group_memberships WHERE id = v_membership_id AND has_contributed_this_cycle = TRUE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already contributed');
  END IF;

  -- 3) Lock wallet and check balance
  SELECT id, available_balance, locked_balance INTO v_wallet_id, v_available, v_locked
  FROM wallets WHERE user_id = _user_id FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_available < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds');
  END IF;

  -- 4) Generate transaction reference
  v_tx_ref := 'contrib-' || _group_id || '-' || _user_id || '-' || extract(epoch from now())::bigint;

  -- 5) Create ledger DEBIT entry
  INSERT INTO ledger_entries (
    user_id, wallet_id, amount, entry_type, reference_type, reference_id,
    balance_before, balance_after, locked_before, locked_after, description
  ) VALUES (
    _user_id, v_wallet_id, _amount, 'debit', 'group_contribution', v_tx_ref,
    v_available, v_available - _amount, v_locked, v_locked, 'Contribution to group ' || _group_id
  );

  -- 6) Update wallet snapshot
  UPDATE wallets SET available_balance = available_balance - _amount, updated_at = now() WHERE id = v_wallet_id;

  -- 7) Credit group wallet
  UPDATE group_wallets SET contribution_balance = COALESCE(contribution_balance, 0) + _amount, updated_at = now() WHERE group_id = _group_id;

  -- 8) Record cycle contribution
  INSERT INTO cycle_contributions (user_id, group_id, cycle_id, amount, status, contributed_at)
  VALUES (_user_id, _group_id, v_cycle_id, _amount, 'completed', now());

  -- 9) Mark membership as contributed
  UPDATE group_memberships SET has_contributed_this_cycle = TRUE WHERE id = v_membership_id;

  -- 10) Record audit entry
  INSERT INTO contribution_audit (user_id, group_id, cycle_id, amount, contribution_type, status)
  VALUES (_user_id, _group_id, v_cycle_id, _amount, 'manual', 'success');

  -- 11) Transaction record
  INSERT INTO transactions (user_id, group_id, type, amount, status, reference, description)
  VALUES (_user_id, _group_id, 'contribution', _amount, 'completed', v_tx_ref, 'Group contribution');

  -- 12) Check if all members have now contributed
  SELECT COUNT(*) INTO v_active_count FROM group_memberships WHERE group_id = _group_id AND status = 'active';
  SELECT COUNT(*) INTO v_contributed_count FROM group_memberships WHERE group_id = _group_id AND status = 'active' AND has_contributed_this_cycle = TRUE;
  v_all_contributed := (v_active_count = v_contributed_count);

  -- 13) If all contributed, auto-trigger payout
  IF v_all_contributed THEN
    SELECT process_payout_internal(_group_id) INTO v_payout_result;
  END IF;

  RETURN jsonb_build_object('success', true, 'tx_ref', v_tx_ref, 'all_contributed', v_all_contributed, 'auto_payout', v_payout_result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_contribution_ledger_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_contribution_ledger_atomic TO service_role;