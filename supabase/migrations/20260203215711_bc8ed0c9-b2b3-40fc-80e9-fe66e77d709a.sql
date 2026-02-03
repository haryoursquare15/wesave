-- Update process_payout_internal to also increment completed_cycles for the recipient
CREATE OR REPLACE FUNCTION public.process_payout_internal(_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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
  
  -- Record platform fee transaction (this tracks the fee, we'll transfer it via Flutterwave)
  INSERT INTO public.transactions (user_id, type, amount, status, group_id, description)
  VALUES (v_group.admin_id, 'service_fee', v_platform_fee, 'pending', _group_id, 'Platform service fee (pending transfer)');
  
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
    
    -- Reset has_received_payout for all members (for potential restart)
    UPDATE public.group_memberships
    SET has_received_payout = false
    WHERE group_id = _group_id;
    
    RETURN json_build_object(
      'success', true,
      'recipient_id', v_recipient_id,
      'net_amount', v_net_amount,
      'platform_fee', v_platform_fee,
      'group_completed', true,
      'needs_restart_decision', true,
      'message', 'All cycles complete! Members can now decide to continue or exit.'
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
$function$;

-- Create function for member to exit a completed group
CREATE OR REPLACE FUNCTION public.exit_completed_group(_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id UUID;
  v_group RECORD;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get group
  SELECT * INTO v_group
  FROM public.thrift_groups
  WHERE id = _group_id;
  
  IF v_group IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Group not found');
  END IF;
  
  IF v_group.status != 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'Can only exit completed groups');
  END IF;
  
  -- Remove membership
  UPDATE public.group_memberships
  SET status = 'removed'
  WHERE group_id = _group_id AND user_id = v_user_id;
  
  -- Record exit in chat
  INSERT INTO public.chat_messages (group_id, user_id, message, message_type)
  VALUES (_group_id, v_user_id, 'has left the group', 'system');
  
  RETURN json_build_object('success', true, 'message', 'Successfully exited the group');
END;
$function$;

-- Create function for admin to restart a completed group (once it has enough members)
CREATE OR REPLACE FUNCTION public.restart_completed_group(_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id UUID;
  v_group RECORD;
  v_member_count INTEGER;
  v_new_cycle_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get group
  SELECT * INTO v_group
  FROM public.thrift_groups
  WHERE id = _group_id
  FOR UPDATE;
  
  IF v_group IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Group not found');
  END IF;
  
  IF v_group.admin_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Only admin can restart the group');
  END IF;
  
  IF v_group.status != 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'Group is not in completed status');
  END IF;
  
  -- Check active member count
  SELECT COUNT(*) INTO v_member_count
  FROM public.group_memberships
  WHERE group_id = _group_id AND status = 'active';
  
  IF v_member_count < v_group.max_members THEN
    RETURN json_build_object('success', false, 'error', 'Group needs ' || v_group.max_members || ' members to restart. Currently has ' || v_member_count);
  END IF;
  
  -- Re-randomize payout order using Fisher-Yates
  WITH shuffled AS (
    SELECT user_id, row_number() OVER (ORDER BY random()) as new_position
    FROM public.group_memberships
    WHERE group_id = _group_id AND status = 'active'
  )
  UPDATE public.group_memberships gm
  SET payout_position = s.new_position,
      has_received_payout = false,
      has_contributed_this_cycle = false,
      has_used_swap = false
  FROM shuffled s
  WHERE gm.group_id = _group_id AND gm.user_id = s.user_id;
  
  -- Update payout_order array
  UPDATE public.thrift_groups
  SET payout_order = (
    SELECT array_agg(user_id ORDER BY payout_position)
    FROM public.group_memberships
    WHERE group_id = _group_id AND status = 'active'
  ),
  current_payout_position = 1,
  current_cycle = 1,
  status = 'active',
  updated_at = now()
  WHERE id = _group_id;
  
  -- Create new cycle
  INSERT INTO public.contribution_cycles (group_id, cycle_number, status, payout_recipient_id)
  SELECT _group_id, 1, 'active', gm.user_id
  FROM public.group_memberships gm
  WHERE gm.group_id = _group_id 
    AND gm.payout_position = 1
    AND gm.status = 'active'
  RETURNING id INTO v_new_cycle_id;
  
  -- Announce restart in chat
  INSERT INTO public.chat_messages (group_id, user_id, message, message_type)
  VALUES (_group_id, v_user_id, 'Thrift has been restarted! New payout order has been randomized.', 'system');
  
  RETURN json_build_object(
    'success', true,
    'message', 'Group restarted successfully with new payout order',
    'new_cycle_id', v_new_cycle_id
  );
END;
$function$;

-- Create function for member to confirm they want to continue
CREATE OR REPLACE FUNCTION public.confirm_continue_group(_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id UUID;
  v_group RECORD;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get group
  SELECT * INTO v_group
  FROM public.thrift_groups
  WHERE id = _group_id;
  
  IF v_group IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Group not found');
  END IF;
  
  IF v_group.status != 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'Group is not in completed status');
  END IF;
  
  -- Record confirmation in chat
  INSERT INTO public.chat_messages (group_id, user_id, message, message_type)
  VALUES (_group_id, v_user_id, 'confirmed to continue in the group', 'system');
  
  RETURN json_build_object('success', true, 'message', 'Your decision to continue has been recorded');
END;
$function$;