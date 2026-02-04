-- Update process_payout_internal to record platform fees in the platform ledger
CREATE OR REPLACE FUNCTION public.process_payout_internal(_group_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_payout_id UUID;
  v_fee_result JSON;
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
  
  -- Record payout and get its ID
  INSERT INTO public.payouts (group_id, cycle_id, recipient_id, gross_amount, platform_fee, net_amount, status, processed_at)
  VALUES (_group_id, v_cycle.id, v_recipient_id, v_gross_amount, v_platform_fee, v_net_amount, 'completed', now())
  RETURNING id INTO v_payout_id;
  
  -- Record transaction for recipient
  INSERT INTO public.transactions (user_id, type, amount, status, group_id, description)
  VALUES (v_recipient_id, 'payout', v_net_amount, 'completed', _group_id, 'Group payout');
  
  -- RECORD PLATFORM FEE in the platform wallet/ledger
  SELECT record_platform_fee(
    v_platform_fee,
    'payout',
    v_payout_id,
    v_recipient_id,
    _group_id
  ) INTO v_fee_result;
  
  -- Update recipient membership
  UPDATE public.group_memberships
  SET has_received_payout = true
  WHERE group_id = _group_id AND user_id = v_recipient_id;
  
  -- INCREMENT COMPLETED CYCLES FOR THE RECIPIENT
  UPDATE public.profiles
  SET completed_cycles = COALESCE(completed_cycles, 0) + 1,
      updated_at = now()
  WHERE id = v_recipient_id;
  
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
    -- Mark group as completed - members will need to decide to continue or exit
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
      'message', 'All members have received payouts. Group round completed.'
    );
  ELSE
    -- Advance to next payout position
    UPDATE public.thrift_groups
    SET current_payout_position = current_payout_position + 1,
        current_cycle = current_cycle + 1,
        updated_at = now()
    WHERE id = _group_id;
    
    -- Create new cycle
    INSERT INTO public.contribution_cycles (group_id, cycle_number, status)
    VALUES (_group_id, v_group.current_cycle + 1, 'active')
    RETURNING id INTO v_new_cycle_id;
    
    RETURN json_build_object(
      'success', true,
      'recipient_id', v_recipient_id,
      'net_amount', v_net_amount,
      'platform_fee', v_platform_fee,
      'new_cycle_id', v_new_cycle_id,
      'next_position', v_group.current_payout_position + 1
    );
  END IF;
END;
$$;

-- Also backfill platform ledger from existing payouts that weren't recorded
DO $$
DECLARE
  v_payout RECORD;
  v_platform_wallet RECORD;
  v_running_balance NUMERIC := 0;
BEGIN
  -- Get current platform wallet balance
  SELECT * INTO v_platform_wallet FROM platform_wallet WHERE wallet_type = 'revenue';
  v_running_balance := COALESCE(v_platform_wallet.available_balance, 0);
  
  -- Check if ledger is empty
  IF NOT EXISTS (SELECT 1 FROM platform_ledger LIMIT 1) THEN
    -- Backfill from completed payouts
    FOR v_payout IN 
      SELECT id, platform_fee, recipient_id, group_id, created_at
      FROM payouts 
      WHERE status = 'completed' AND platform_fee > 0
      ORDER BY created_at ASC
    LOOP
      INSERT INTO platform_ledger (
        entry_type, amount, balance_before, balance_after,
        source_type, source_id, source_user_id, source_group_id,
        description, created_at
      ) VALUES (
        'fee_collected', v_payout.platform_fee,
        v_running_balance, v_running_balance + v_payout.platform_fee,
        'payout', v_payout.id, v_payout.recipient_id, v_payout.group_id,
        'Service fee collected from payout (backfilled)',
        v_payout.created_at
      );
      
      v_running_balance := v_running_balance + v_payout.platform_fee;
    END LOOP;
    
    -- Update platform wallet with correct total
    UPDATE platform_wallet
    SET available_balance = v_running_balance,
        total_collected = v_running_balance,
        updated_at = now()
    WHERE wallet_type = 'revenue';
  END IF;
END;
$$;