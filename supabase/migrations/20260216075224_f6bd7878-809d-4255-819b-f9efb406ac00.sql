
-- =====================================================
-- 1. Create platform_expenses table for tracking
--    operational costs (VAT, transfer fees, etc.)
-- =====================================================
CREATE TABLE public.platform_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_type TEXT NOT NULL, -- 'card_processing_vat', 'transfer_fee', etc.
  amount NUMERIC NOT NULL,
  description TEXT,
  source_type TEXT, -- 'contribution', 'withdrawal', etc.
  source_id TEXT,
  source_user_id UUID,
  source_group_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_expenses ENABLE ROW LEVEL SECURITY;

-- Only admins can view platform expenses
CREATE POLICY "Admins can view platform expenses"
  ON public.platform_expenses FOR SELECT
  USING (public.is_any_admin(auth.uid()));

-- Service role inserts (edge functions)
CREATE POLICY "Service role can insert platform expenses"
  ON public.platform_expenses FOR INSERT
  WITH CHECK (true);

-- Add index for querying by type and date
CREATE INDEX idx_platform_expenses_type_created ON public.platform_expenses (expense_type, created_at DESC);

-- =====================================================
-- 2. Create record_platform_expense function
-- =====================================================
CREATE OR REPLACE FUNCTION public.record_platform_expense(
  _amount NUMERIC,
  _expense_type TEXT,
  _description TEXT,
  _source_type TEXT DEFAULT NULL,
  _source_id TEXT DEFAULT NULL,
  _source_user_id UUID DEFAULT NULL,
  _source_group_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_expenses (
    expense_type, amount, description,
    source_type, source_id, source_user_id, source_group_id, metadata
  ) VALUES (
    _expense_type, _amount, _description,
    _source_type, _source_id, _source_user_id, _source_group_id, _metadata
  );
  
  RETURN json_build_object('success', true);
END;
$$;

-- =====================================================
-- 3. Modify process_payout_internal to remove 2% fee
--    Internal payouts are now fee-free wallet transfers
-- =====================================================
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
  v_payout_amount NUMERIC;
  v_recipient_wallet_id UUID;
  v_new_cycle_id UUID;
  v_group_member_count INTEGER;
  v_payout_id UUID;
  v_old_balance NUMERIC;
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
  
  -- Full amount goes to recipient (NO platform fee on internal transfers)
  v_payout_amount := v_group_balance;
  
  -- Get recipient wallet + lock
  SELECT id, coalesce(available_balance, 0)
    INTO v_recipient_wallet_id, v_old_balance
  FROM public.wallets
  WHERE user_id = v_recipient_id
  FOR UPDATE;
  
  IF v_recipient_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipient wallet not found');
  END IF;
  
  -- Credit recipient wallet with FULL amount
  UPDATE public.wallets
  SET available_balance = v_old_balance + v_payout_amount,
      updated_at = now()
  WHERE id = v_recipient_wallet_id;
  
  -- Record ledger entry for recipient (credit)
  INSERT INTO public.ledger_entries(
    user_id, wallet_id, amount,
    balance_before, balance_after,
    locked_before, locked_after,
    entry_type, reference_type, reference_id,
    description, metadata
  ) VALUES (
    v_recipient_id, v_recipient_wallet_id, v_payout_amount,
    v_old_balance, v_old_balance + v_payout_amount,
    coalesce((SELECT locked_balance FROM public.wallets WHERE id = v_recipient_wallet_id), 0),
    coalesce((SELECT locked_balance FROM public.wallets WHERE id = v_recipient_wallet_id), 0),
    'credit', 'group_payout', _group_id::text,
    'Group payout (internal transfer)',
    jsonb_build_object('group_id', _group_id, 'cycle_id', v_cycle.id, 'amount', v_payout_amount)
  );
  
  -- Debit group wallet
  UPDATE public.group_wallets
  SET contribution_balance = 0,
      updated_at = now()
  WHERE group_id = _group_id;
  
  -- Record payout (platform_fee = 0 for internal transfers)
  INSERT INTO public.payouts (group_id, cycle_id, recipient_id, gross_amount, platform_fee, net_amount, status, processed_at)
  VALUES (_group_id, v_cycle.id, v_recipient_id, v_payout_amount, 0, v_payout_amount, 'completed', now())
  RETURNING id INTO v_payout_id;
  
  -- Record transaction for recipient
  INSERT INTO public.transactions (user_id, type, amount, status, group_id, description, reference)
  VALUES (v_recipient_id, 'payout', v_payout_amount, 'completed', _group_id, 'Group payout', v_payout_id::text);
  
  -- Update recipient membership
  UPDATE public.group_memberships
  SET has_received_payout = true
  WHERE group_id = _group_id AND user_id = v_recipient_id;
  
  -- Increment completed cycles for the recipient
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
      payout_amount = v_payout_amount,
      platform_fee = 0,
      payout_recipient_id = v_recipient_id
  WHERE id = v_cycle.id;
  
  -- Get member count
  SELECT COUNT(*) INTO v_group_member_count
  FROM public.group_memberships
  WHERE group_id = _group_id AND status = 'active';
  
  -- Check if this was the last cycle
  IF v_group.current_payout_position >= v_group_member_count THEN
    UPDATE public.thrift_groups
    SET status = 'completed',
        updated_at = now()
    WHERE id = _group_id;
    
    RETURN json_build_object(
      'success', true,
      'message', 'Final payout completed! Group cycle finished.',
      'recipient_id', v_recipient_id,
      'gross_amount', v_payout_amount,
      'platform_fee', 0,
      'net_amount', v_payout_amount,
      'group_completed', true
    );
  END IF;
  
  -- Advance payout position
  UPDATE public.thrift_groups
  SET current_payout_position = current_payout_position + 1,
      current_cycle = v_group.current_cycle + 1,
      updated_at = now()
  WHERE id = _group_id;
  
  -- Create next cycle
  INSERT INTO public.contribution_cycles (group_id, cycle_number, status)
  VALUES (_group_id, v_group.current_cycle + 1, 'active')
  RETURNING id INTO v_new_cycle_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Payout processed successfully',
    'recipient_id', v_recipient_id,
    'gross_amount', v_payout_amount,
    'platform_fee', 0,
    'net_amount', v_payout_amount,
    'new_cycle_id', v_new_cycle_id,
    'group_completed', false
  );
END;
$$;
