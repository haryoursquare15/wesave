-- Create a ledger-enforced contribution processor (does not rely on legacy balance mutations)
-- Ensures: wallet debit -> ledger entry -> group wallet credit -> cycle contribution record -> membership flag
-- Returns a JSON payload compatible with existing frontend expectations.

CREATE OR REPLACE FUNCTION public.process_contribution_ledger_atomic(
  _user_id uuid,
  _group_id uuid,
  _amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle_id uuid;
  v_wallet_id uuid;
  v_available numeric;
  v_new_balance numeric;
  v_tx_ref uuid;
  v_pending_count integer;
  v_auto_payout json;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  -- Active cycle must exist
  SELECT id INTO v_cycle_id
  FROM public.contribution_cycles
  WHERE group_id = _group_id AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_cycle_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active cycle');
  END IF;

  -- Prevent double contribution
  IF EXISTS (
    SELECT 1
    FROM public.cycle_contributions
    WHERE cycle_id = v_cycle_id
      AND group_id = _group_id
      AND user_id = _user_id
      AND coalesce(status, 'completed') = 'completed'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Already contributed');
  END IF;

  -- Lock wallet row and validate funds
  SELECT id, coalesce(available_balance, 0)
    INTO v_wallet_id, v_available
  FROM public.wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_available < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient funds');
  END IF;

  v_new_balance := v_available - _amount;
  v_tx_ref := gen_random_uuid();

  -- Record ledger debit (source of truth)
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
    description,
    metadata
  ) VALUES (
    _user_id,
    v_wallet_id,
    _amount,
    v_available,
    v_new_balance,
    coalesce((SELECT locked_balance FROM public.wallets WHERE id = v_wallet_id), 0),
    coalesce((SELECT locked_balance FROM public.wallets WHERE id = v_wallet_id), 0),
    'debit',
    'group_contribution',
    v_tx_ref::text,
    'Group contribution',
    jsonb_build_object('group_id', _group_id, 'cycle_id', v_cycle_id)
  );

  -- Update wallet snapshot balance (kept in-sync with ledger)
  UPDATE public.wallets
  SET available_balance = v_new_balance,
      updated_at = now()
  WHERE id = v_wallet_id;

  -- Credit group wallet
  INSERT INTO public.group_wallets (group_id, contribution_balance, created_at, updated_at)
  VALUES (_group_id, _amount, now(), now())
  ON CONFLICT (group_id)
  DO UPDATE SET
    contribution_balance = coalesce(public.group_wallets.contribution_balance, 0) + EXCLUDED.contribution_balance,
    updated_at = now();

  -- Create contribution record
  INSERT INTO public.cycle_contributions(
    cycle_id,
    group_id,
    user_id,
    amount,
    status,
    contributed_at,
    flw_transaction_ref
  ) VALUES (
    v_cycle_id,
    _group_id,
    _user_id,
    _amount,
    'completed',
    now(),
    v_tx_ref::text
  );

  -- Mark membership contributed
  UPDATE public.group_memberships
  SET has_contributed_this_cycle = true
  WHERE group_id = _group_id
    AND user_id = _user_id
    AND status = 'active';

  -- Update cycle totals (best-effort)
  UPDATE public.contribution_cycles
  SET total_contributions = coalesce(total_contributions, 0) + _amount
  WHERE id = v_cycle_id;

  -- Record transaction snapshot
  INSERT INTO public.transactions(
    user_id,
    type,
    amount,
    status,
    reference,
    description,
    group_id
  ) VALUES (
    _user_id,
    'contribution',
    _amount,
    'completed',
    v_tx_ref::text,
    'Group contribution',
    _group_id
  );

  -- Determine if all have contributed
  SELECT count(*)::int INTO v_pending_count
  FROM public.group_memberships
  WHERE group_id = _group_id
    AND status = 'active'
    AND coalesce(has_contributed_this_cycle, false) = false;

  IF v_pending_count = 0 THEN
    -- Attempt automated payout (if configured in existing system)
    BEGIN
      SELECT public.process_payout_internal(_group_id) INTO v_auto_payout;
    EXCEPTION WHEN OTHERS THEN
      v_auto_payout := json_build_object('success', false, 'error', 'Auto payout failed');
    END;

    RETURN json_build_object(
      'success', true,
      'all_contributed', true,
      'new_balance', v_new_balance,
      'auto_payout', v_auto_payout
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'all_contributed', false,
    'new_balance', v_new_balance
  );
END;
$$;

-- Lock down execute permissions to authenticated users via RLS context (RPC is called via service role in backend functions)
REVOKE ALL ON FUNCTION public.process_contribution_ledger_atomic(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_contribution_ledger_atomic(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_contribution_ledger_atomic(uuid, uuid, numeric) TO service_role;
