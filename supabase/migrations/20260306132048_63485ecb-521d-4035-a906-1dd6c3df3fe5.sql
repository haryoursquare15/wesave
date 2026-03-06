
-- Replace respond_to_invite to also sweep wallet for first contribution on accept
CREATE OR REPLACE FUNCTION public.respond_to_invite(invite_id uuid, accept boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record RECORD;
  group_record RECORD;
  current_member_count BIGINT;
  new_position INTEGER;
  wallet_record RECORD;
  active_cycle RECORD;
  contribution_amount NUMERIC;
  ledger_id UUID;
BEGIN
  -- Get invite
  SELECT mi.* INTO invite_record
  FROM public.member_invites mi
  WHERE mi.id = invite_id AND mi.invitee_id = auth.uid() AND mi.status = 'pending';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found or already responded');
  END IF;

  -- Get group details
  SELECT * INTO group_record
  FROM public.thrift_groups
  WHERE id = invite_record.group_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Group not found');
  END IF;
  
  IF NOT accept THEN
    -- Reject invite
    UPDATE public.member_invites
    SET status = 'rejected', responded_at = now()
    WHERE id = respond_to_invite.invite_id;
    
    RETURN json_build_object('success', true, 'message', 'Invite declined');
  END IF;

  -- === ACCEPT FLOW ===

  -- Check if group is full
  SELECT COUNT(*) INTO current_member_count
  FROM public.group_memberships
  WHERE group_id = invite_record.group_id AND status = 'active';
  
  IF current_member_count >= group_record.max_members THEN
    UPDATE public.member_invites
    SET status = 'rejected', responded_at = now()
    WHERE id = respond_to_invite.invite_id;
    
    RETURN json_build_object('success', false, 'error', 'Group is now full');
  END IF;

  contribution_amount := group_record.contribution_amount;

  -- Check wallet balance
  SELECT * INTO wallet_record
  FROM public.wallets
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found. Please fund your wallet first.');
  END IF;

  IF wallet_record.available_balance < contribution_amount THEN
    RETURN json_build_object('success', false, 'error', 
      'Insufficient wallet balance. You need ₦' || contribution_amount::text || ' to join. Please fund your wallet first.');
  END IF;

  -- Find active cycle (if any)
  SELECT * INTO active_cycle
  FROM public.contribution_cycles
  WHERE group_id = invite_record.group_id AND status = 'active'
  ORDER BY cycle_number DESC
  LIMIT 1;

  -- Debit wallet
  UPDATE public.wallets
  SET available_balance = available_balance - contribution_amount,
      updated_at = now()
  WHERE id = wallet_record.id;

  -- Record ledger entry
  INSERT INTO public.ledger_entries (
    wallet_id, user_id, entry_type, amount, 
    balance_before, balance_after,
    locked_before, locked_after,
    reference_type, reference_id, description
  ) VALUES (
    wallet_record.id, auth.uid(), 'debit', contribution_amount,
    wallet_record.available_balance, wallet_record.available_balance - contribution_amount,
    wallet_record.locked_balance, wallet_record.locked_balance,
    'group_join_contribution', invite_record.group_id::text,
    'First contribution for joining ' || group_record.name
  ) RETURNING id INTO ledger_id;

  -- Add membership
  new_position := current_member_count + 1;
  
  INSERT INTO public.group_memberships (group_id, user_id, payout_position, status, has_contributed_this_cycle)
  VALUES (invite_record.group_id, auth.uid(), new_position, 'active', true)
  ON CONFLICT (group_id, user_id) 
  DO UPDATE SET status = 'active', payout_position = new_position, has_contributed_this_cycle = true;

  -- If there's an active cycle, record the cycle contribution
  IF active_cycle.id IS NOT NULL THEN
    INSERT INTO public.cycle_contributions (cycle_id, group_id, user_id, amount, status, contributed_at)
    VALUES (active_cycle.id, invite_record.group_id, auth.uid(), contribution_amount, 'paid', now())
    ON CONFLICT DO NOTHING;

    -- Credit group wallet
    UPDATE public.group_wallets
    SET contribution_balance = COALESCE(contribution_balance, 0) + contribution_amount,
        updated_at = now()
    WHERE group_id = invite_record.group_id;
  END IF;

  -- Update invite status
  UPDATE public.member_invites
  SET status = 'accepted', responded_at = now()
  WHERE id = respond_to_invite.invite_id;

  -- Record transaction
  INSERT INTO public.transactions (user_id, wallet_id, group_id, type, amount, status, description)
  VALUES (auth.uid(), wallet_record.id, invite_record.group_id, 'contribution', contribution_amount, 'completed',
    'First contribution for ' || group_record.name);

  -- Notify user
  INSERT INTO public.user_notifications (user_id, title, message, notification_type, group_id)
  VALUES (auth.uid(), 'Joined ' || group_record.name,
    'You joined and paid your first contribution of ₦' || contribution_amount::text || '.',
    'contribution_success', invite_record.group_id);

  RETURN json_build_object(
    'success', true, 
    'message', 'Joined and paid ₦' || contribution_amount::text || ' contribution!',
    'group_id', invite_record.group_id,
    'amount_paid', contribution_amount,
    'payment_source', 'wallet'
  );
END;
$$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
