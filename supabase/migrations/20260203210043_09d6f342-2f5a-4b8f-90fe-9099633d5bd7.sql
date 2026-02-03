-- Update process_contribution_atomic to automatically trigger payout when all members have contributed
-- This removes the need for admin to manually process payout

CREATE OR REPLACE FUNCTION public.process_contribution_atomic(
  _user_id UUID,
  _group_id UUID,
  _amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
  v_payout_result JSON;
  v_admin_id UUID;
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
  
  -- If all contributed, automatically process payout
  IF v_all_contributed THEN
    -- Get admin id for payout processing
    SELECT admin_id INTO v_admin_id
    FROM public.thrift_groups
    WHERE id = _group_id;
    
    -- Call payout function directly
    SELECT public.process_payout_internal(_group_id) INTO v_payout_result;
    
    -- Log auto-payout event
    PERFORM log_audit_event(
      _user_id,
      'auto_payout_triggered'::text,
      'contribution_cycles'::text,
      v_cycle_id::text,
      json_build_object('group_id', _group_id, 'member_count', v_member_count, 'payout_result', v_payout_result)::jsonb
    );
    
    RETURN json_build_object(
      'success', true,
      'all_contributed', true,
      'new_balance', v_available_balance - _amount,
      'auto_payout', v_payout_result
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'all_contributed', false,
    'new_balance', v_available_balance - _amount
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in process_contribution_atomic: % %', SQLERRM, SQLSTATE;
    RETURN json_build_object('success', false, 'error', 'Operation failed');
END;
$$;

-- Create internal payout function (no admin check - used for auto-payout)
CREATE OR REPLACE FUNCTION public.process_payout_internal(_group_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_group RECORD;
  v_recipient_id UUID;
  v_cycle RECORD;
  v_group_balance NUMERIC;
  v_gross_amount NUMERIC;
  v_platform_fee NUMERIC;
  v_net_amount NUMERIC;
  v_recipient_wallet_id UUID;
  v_new_cycle_id UUID;
  v_group_member_count INTEGER;
BEGIN
  -- Get group (with lock)
  SELECT * INTO v_group
  FROM public.thrift_groups
  WHERE id = _group_id
  FOR UPDATE;
  
  IF v_group IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Group not found');
  END IF;
  
  -- Get active cycle
  SELECT * INTO v_cycle
  FROM public.contribution_cycles
  WHERE group_id = _group_id AND status = 'active'
  ORDER BY cycle_number DESC
  LIMIT 1
  FOR UPDATE;
  
  IF v_cycle IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active cycle');
  END IF;
  
  -- Get current payout recipient
  SELECT user_id INTO v_recipient_id
  FROM public.group_memberships
  WHERE group_id = _group_id 
    AND payout_position = v_group.current_payout_position
    AND status = 'active';
  
  IF v_recipient_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No recipient found');
  END IF;
  
  -- Get group wallet balance
  SELECT contribution_balance INTO v_group_balance
  FROM public.group_wallets
  WHERE group_id = _group_id
  FOR UPDATE;
  
  IF v_group_balance IS NULL OR v_group_balance <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient pool funds');
  END IF;
  
  -- Calculate amounts
  v_gross_amount := v_group_balance;
  v_platform_fee := ROUND(v_gross_amount * 0.02, 2);
  v_net_amount := v_gross_amount - v_platform_fee;
  
  -- Get recipient wallet
  SELECT id INTO v_recipient_wallet_id
  FROM public.wallets
  WHERE user_id = v_recipient_id
  FOR UPDATE;
  
  IF v_recipient_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipient wallet not found');
  END IF;
  
  -- Credit recipient wallet
  UPDATE public.wallets
  SET available_balance = available_balance + v_net_amount,
      updated_at = now()
  WHERE id = v_recipient_wallet_id;
  
  -- Debit group wallet
  UPDATE public.group_wallets
  SET contribution_balance = 0,
      updated_at = now()
  WHERE group_id = _group_id;
  
  -- Record payout
  INSERT INTO public.payouts (group_id, cycle_id, recipient_id, gross_amount, platform_fee, net_amount, status, processed_at)
  VALUES (_group_id, v_cycle.id, v_recipient_id, v_gross_amount, v_platform_fee, v_net_amount, 'completed', now());
  
  -- Record transaction for recipient
  INSERT INTO public.transactions (user_id, type, amount, status, group_id, description)
  VALUES (v_recipient_id, 'payout', v_net_amount, 'completed', _group_id, 'Group payout');
  
  -- Record platform fee transaction
  INSERT INTO public.transactions (user_id, type, amount, status, group_id, description)
  VALUES (v_group.admin_id, 'service_fee', v_platform_fee, 'completed', _group_id, 'Platform service fee');
  
  -- Update recipient membership
  UPDATE public.group_memberships
  SET has_received_payout = true
  WHERE group_id = _group_id AND user_id = v_recipient_id;
  
  -- Reset contribution flags for next cycle
  UPDATE public.group_memberships
  SET has_contributed_this_cycle = false
  WHERE group_id = _group_id;
  
  -- Complete current cycle
  UPDATE public.contribution_cycles
  SET status = 'completed',
      completed_at = now(),
      payout_amount = v_net_amount,
      platform_fee = v_platform_fee,
      payout_recipient_id = v_recipient_id
  WHERE id = v_cycle.id;
  
  -- Get member count
  SELECT COUNT(*) INTO v_group_member_count
  FROM public.group_memberships
  WHERE group_id = _group_id AND status = 'active';
  
  -- Check if this was the last cycle (all members have received payout)
  IF v_group.current_payout_position >= v_group_member_count THEN
    -- Mark group as completed
    UPDATE public.thrift_groups
    SET status = 'completed',
        updated_at = now()
    WHERE id = _group_id;
    
    RETURN json_build_object(
      'success', true,
      'recipient_id', v_recipient_id,
      'net_amount', v_net_amount,
      'platform_fee', v_platform_fee,
      'group_completed', true,
      'message', 'All cycles complete! Group has finished.'
    );
  ELSE
    -- Advance to next cycle
    UPDATE public.thrift_groups
    SET current_payout_position = current_payout_position + 1,
        current_cycle = current_cycle + 1,
        updated_at = now()
    WHERE id = _group_id;
    
    -- Create new cycle
    INSERT INTO public.contribution_cycles (group_id, cycle_number, status, payout_recipient_id)
    SELECT _group_id, v_group.current_cycle + 1, 'active', gm.user_id
    FROM public.group_memberships gm
    WHERE gm.group_id = _group_id 
      AND gm.payout_position = v_group.current_payout_position + 1
      AND gm.status = 'active'
    RETURNING id INTO v_new_cycle_id;
    
    RETURN json_build_object(
      'success', true,
      'recipient_id', v_recipient_id,
      'net_amount', v_net_amount,
      'platform_fee', v_platform_fee,
      'group_completed', false,
      'new_cycle_id', v_new_cycle_id,
      'message', 'Payout processed. New cycle started.'
    );
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in process_payout_internal: % %', SQLERRM, SQLSTATE;
    RETURN json_build_object('success', false, 'error', 'Payout operation failed');
END;
$$;

-- Update the admin-triggered payout to use the internal function
CREATE OR REPLACE FUNCTION public.process_payout_atomic(
  _admin_id UUID,
  _group_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_group_admin_id UUID;
BEGIN
  -- Verify caller is admin of the group
  SELECT admin_id INTO v_group_admin_id
  FROM public.thrift_groups
  WHERE id = _group_id;
  
  IF v_group_admin_id IS NULL OR v_group_admin_id != _admin_id THEN
    RETURN json_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  -- Delegate to internal function
  RETURN public.process_payout_internal(_group_id);
END;
$$;