-- Fix process_contribution_atomic to use correct jsonb type for log_audit_event
CREATE OR REPLACE FUNCTION public.process_contribution_atomic(
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
  v_wallet_id UUID;
  v_available_balance NUMERIC;
  v_cycle_id UUID;
  v_contribution_exists BOOLEAN;
  v_all_contributed BOOLEAN;
  v_member_count INTEGER;
  v_contribution_count INTEGER;
  v_is_member BOOLEAN;
BEGIN
  -- CRITICAL: Validate user is a member of the group
  SELECT EXISTS(
    SELECT 1 FROM public.group_memberships
    WHERE group_id = _group_id AND user_id = _user_id AND status = 'active'
  ) INTO v_is_member;
  
  IF NOT v_is_member THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of this group');
  END IF;

  -- Lock wallet row to prevent concurrent modifications
  SELECT id, available_balance INTO v_wallet_id, v_available_balance
  FROM public.wallets
  WHERE user_id = _user_id
  FOR UPDATE;
  
  IF v_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  
  IF v_available_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient funds');
  END IF;
  
  -- Get active cycle
  SELECT id INTO v_cycle_id
  FROM public.contribution_cycles
  WHERE group_id = _group_id AND status = 'active'
  ORDER BY cycle_number DESC
  LIMIT 1;
  
  IF v_cycle_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active cycle');
  END IF;
  
  -- Check if already contributed
  SELECT EXISTS(
    SELECT 1 FROM public.cycle_contributions
    WHERE cycle_id = v_cycle_id AND user_id = _user_id AND status = 'completed'
  ) INTO v_contribution_exists;
  
  IF v_contribution_exists THEN
    RETURN json_build_object('success', false, 'error', 'Already contributed');
  END IF;
  
  -- Deduct from wallet
  UPDATE public.wallets
  SET available_balance = available_balance - _amount,
      updated_at = now()
  WHERE id = v_wallet_id;
  
  -- Record contribution
  INSERT INTO public.cycle_contributions (cycle_id, group_id, user_id, amount, status, contributed_at)
  VALUES (v_cycle_id, _group_id, _user_id, _amount, 'completed', now())
  ON CONFLICT DO NOTHING;
  
  -- Update membership flag
  UPDATE public.group_memberships
  SET has_contributed_this_cycle = true
  WHERE group_id = _group_id AND user_id = _user_id;
  
  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount, status, group_id, description)
  VALUES (_user_id, 'contribution', _amount, 'completed', _group_id, 'Group contribution');
  
  -- Update group wallet
  UPDATE public.group_wallets
  SET contribution_balance = contribution_balance + _amount,
      updated_at = now()
  WHERE group_id = _group_id;
  
  -- Add contribution audit record
  INSERT INTO public.contribution_audit (group_id, cycle_id, user_id, amount, contribution_type, status)
  VALUES (_group_id, v_cycle_id, _user_id, _amount, 'manual', 'completed');
  
  -- Check if all members have contributed
  SELECT COUNT(*) INTO v_member_count
  FROM public.group_memberships
  WHERE group_id = _group_id AND status = 'active';
  
  SELECT COUNT(*) INTO v_contribution_count
  FROM public.cycle_contributions
  WHERE cycle_id = v_cycle_id AND status = 'completed';
  
  v_all_contributed := v_member_count = v_contribution_count;
  
  -- If all contributed, trigger auto-payout
  IF v_all_contributed THEN
    -- Log that payout is ready with proper type casting
    PERFORM log_audit_event(
      _user_id,
      'all_contributions_complete'::text,
      'contribution_cycles'::text,
      v_cycle_id::text,
      json_build_object('group_id', _group_id, 'member_count', v_member_count)::jsonb
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'all_contributed', v_all_contributed,
    'new_balance', v_available_balance - _amount
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in process_contribution_atomic: % %', SQLERRM, SQLSTATE;
    RETURN json_build_object('success', false, 'error', 'Operation failed');
END;
$$;