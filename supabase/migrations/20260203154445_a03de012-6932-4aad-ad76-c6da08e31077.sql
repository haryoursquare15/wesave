-- Fix 1: Drop overly permissive INSERT policy on cycle_contributions
DROP POLICY IF EXISTS "System can insert contributions" ON public.cycle_contributions;

-- Ensure the proper user-scoped policy exists
DROP POLICY IF EXISTS "Authenticated users can record their own contributions" ON public.cycle_contributions;
CREATE POLICY "Authenticated users can record their own contributions"
ON public.cycle_contributions 
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Fix 2: Create atomic financial transaction functions

-- Function for atomic contribution processing
CREATE OR REPLACE FUNCTION public.process_contribution_atomic(
  _user_id UUID,
  _group_id UUID,
  _amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet RECORD;
  v_cycle RECORD;
  v_existing_contrib RECORD;
  v_new_balance NUMERIC;
  v_contribution RECORD;
  v_member_count BIGINT;
  v_contribution_count BIGINT;
BEGIN
  -- Lock wallet row for update to prevent race conditions
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF v_wallet IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_wallet.available_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  -- Get active cycle with lock
  SELECT * INTO v_cycle
  FROM public.contribution_cycles
  WHERE group_id = _group_id AND status = 'active'
  FOR UPDATE;

  IF v_cycle IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active contribution cycle');
  END IF;

  -- Check if already contributed
  SELECT * INTO v_existing_contrib
  FROM public.cycle_contributions
  WHERE cycle_id = v_cycle.id AND user_id = _user_id AND status = 'completed';

  IF v_existing_contrib IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'You have already contributed to this cycle');
  END IF;

  -- Deduct from wallet (atomic within transaction)
  v_new_balance := v_wallet.available_balance - _amount;
  UPDATE public.wallets
  SET available_balance = v_new_balance, updated_at = now()
  WHERE id = v_wallet.id;

  -- Record contribution
  INSERT INTO public.cycle_contributions (
    cycle_id, group_id, user_id, amount, status, contributed_at
  )
  VALUES (
    v_cycle.id, _group_id, _user_id, _amount, 'completed', now()
  )
  RETURNING * INTO v_contribution;

  -- Record transaction
  INSERT INTO public.transactions (
    user_id, wallet_id, group_id, type, amount, status, description
  )
  VALUES (
    _user_id, v_wallet.id, _group_id, 'contribution', _amount, 'completed',
    'Contribution to group cycle ' || v_cycle.cycle_number
  );

  -- Update cycle total
  UPDATE public.contribution_cycles
  SET total_contributions = COALESCE(total_contributions, 0) + _amount
  WHERE id = v_cycle.id;

  -- Update membership flag
  UPDATE public.group_memberships
  SET has_contributed_this_cycle = true
  WHERE group_id = _group_id AND user_id = _user_id;

  -- Check if all members have contributed
  SELECT COUNT(*) INTO v_member_count
  FROM public.group_memberships
  WHERE group_id = _group_id AND status = 'active';

  SELECT COUNT(*) INTO v_contribution_count
  FROM public.cycle_contributions
  WHERE cycle_id = v_cycle.id AND status = 'completed';

  RETURN json_build_object(
    'success', true,
    'message', 'Contribution recorded successfully',
    'contribution_id', v_contribution.id,
    'new_balance', v_new_balance,
    'all_contributed', v_contribution_count >= v_member_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function for atomic payout processing
CREATE OR REPLACE FUNCTION public.process_payout_atomic(
  _admin_id UUID,
  _group_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group RECORD;
  v_cycle RECORD;
  v_recipient_wallet RECORD;
  v_gross_amount NUMERIC;
  v_platform_fee NUMERIC;
  v_net_amount NUMERIC;
  v_payout RECORD;
  v_recipient_profile RECORD;
  v_next_recipient_id UUID;
  v_next_cycle_number INTEGER;
  v_next_deadline TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Verify admin and lock group
  SELECT * INTO v_group
  FROM public.thrift_groups
  WHERE id = _group_id AND admin_id = _admin_id
  FOR UPDATE;

  IF v_group IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Only group admin can process payouts');
  END IF;

  -- Get and lock active cycle
  SELECT * INTO v_cycle
  FROM public.contribution_cycles
  WHERE group_id = _group_id AND status = 'active'
  FOR UPDATE;

  IF v_cycle IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active contribution cycle');
  END IF;

  -- Lock recipient wallet
  SELECT * INTO v_recipient_wallet
  FROM public.wallets
  WHERE user_id = v_cycle.payout_recipient_id
  FOR UPDATE;

  IF v_recipient_wallet IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipient wallet not found');
  END IF;

  -- Calculate amounts
  v_gross_amount := COALESCE(v_cycle.total_contributions, 0);
  v_platform_fee := v_gross_amount * 0.02; -- 2% fee
  v_net_amount := v_gross_amount - v_platform_fee;

  -- Create payout record
  INSERT INTO public.payouts (
    group_id, cycle_id, recipient_id, gross_amount, platform_fee, net_amount, status
  )
  VALUES (
    _group_id, v_cycle.id, v_cycle.payout_recipient_id, v_gross_amount, v_platform_fee, v_net_amount, 'processing'
  )
  RETURNING * INTO v_payout;

  -- Credit recipient wallet (atomic)
  UPDATE public.wallets
  SET available_balance = available_balance + v_net_amount, updated_at = now()
  WHERE id = v_recipient_wallet.id;

  -- Record transaction
  INSERT INTO public.transactions (
    user_id, wallet_id, group_id, type, amount, status, description
  )
  VALUES (
    v_cycle.payout_recipient_id, v_recipient_wallet.id, _group_id, 'payout', v_net_amount, 'completed',
    'Thrift payout for cycle ' || v_cycle.cycle_number || ' (2% fee deducted)'
  );

  -- Update payout status
  UPDATE public.payouts
  SET status = 'completed', processed_at = now()
  WHERE id = v_payout.id;

  -- Update cycle
  UPDATE public.contribution_cycles
  SET status = 'completed', platform_fee = v_platform_fee, payout_amount = v_net_amount,
      payout_date = now(), completed_at = now()
  WHERE id = v_cycle.id;

  -- Update membership
  UPDATE public.group_memberships
  SET has_received_payout = true
  WHERE group_id = _group_id AND user_id = v_cycle.payout_recipient_id;

  -- Reset contribution flags for all members
  UPDATE public.group_memberships
  SET has_contributed_this_cycle = false
  WHERE group_id = _group_id;

  -- Get recipient name for message
  SELECT full_name INTO v_recipient_profile
  FROM public.profiles
  WHERE id = v_cycle.payout_recipient_id;

  -- Add chat message
  INSERT INTO public.chat_messages (group_id, user_id, message, message_type)
  VALUES (
    _group_id, _admin_id,
    'Payout of ₦' || v_net_amount::TEXT || ' sent to ' || COALESCE(v_recipient_profile.full_name, 'member') || ' (2% fee: ₦' || v_platform_fee::TEXT || ')',
    'payout_notification'
  );

  -- Check if this was the last cycle
  IF v_group.current_payout_position >= array_length(v_group.payout_order, 1) THEN
    -- Thrift complete
    UPDATE public.thrift_groups SET status = 'completed' WHERE id = _group_id;

    INSERT INTO public.chat_messages (group_id, user_id, message, message_type)
    VALUES (_group_id, _admin_id, 'Thrift cycle complete! All members have received their payouts.', 'system');

    RETURN json_build_object(
      'success', true,
      'message', 'Final payout processed. Thrift cycle complete!',
      'thrift_complete', true,
      'payout_id', v_payout.id,
      'net_amount', v_net_amount
    );
  ELSE
    -- Start next cycle
    v_next_recipient_id := v_group.payout_order[v_group.current_payout_position + 1];
    v_next_cycle_number := v_cycle.cycle_number + 1;

    -- Calculate next deadline
    CASE v_group.period
      WHEN 'daily' THEN v_next_deadline := now() + INTERVAL '1 day';
      WHEN 'weekly' THEN v_next_deadline := now() + INTERVAL '1 week';
      WHEN 'monthly' THEN v_next_deadline := now() + INTERVAL '1 month';
      ELSE v_next_deadline := now() + INTERVAL '1 week';
    END CASE;

    INSERT INTO public.contribution_cycles (group_id, cycle_number, payout_recipient_id, contribution_deadline)
    VALUES (_group_id, v_next_cycle_number, v_next_recipient_id, v_next_deadline);

    UPDATE public.thrift_groups
    SET current_cycle = v_next_cycle_number,
        current_payout_position = current_payout_position + 1,
        next_contribution_date = v_next_deadline,
        next_payout_date = v_next_deadline
    WHERE id = _group_id;

    RETURN json_build_object(
      'success', true,
      'message', 'Payout processed. Next cycle started!',
      'thrift_complete', false,
      'payout_id', v_payout.id,
      'net_amount', v_net_amount,
      'next_cycle', v_next_cycle_number
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function for atomic wallet funding (used by webhook)
CREATE OR REPLACE FUNCTION public.credit_wallet_atomic(
  _user_id UUID,
  _amount NUMERIC,
  _tx_ref TEXT,
  _description TEXT DEFAULT 'Wallet funding'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet RECORD;
  v_new_balance NUMERIC;
BEGIN
  -- Lock wallet for atomic update
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF v_wallet IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Credit wallet
  v_new_balance := v_wallet.available_balance + _amount;
  UPDATE public.wallets
  SET available_balance = v_new_balance, updated_at = now()
  WHERE id = v_wallet.id;

  -- Update transaction status
  UPDATE public.transactions
  SET status = 'completed'
  WHERE reference = _tx_ref;

  RETURN json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'amount', _amount
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;