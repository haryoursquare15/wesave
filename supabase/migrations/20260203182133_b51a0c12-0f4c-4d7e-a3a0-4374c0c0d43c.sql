-- Add encrypted columns for sensitive PII data
-- These columns store AES-256-GCM encrypted values

-- Add encrypted columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bvn_encrypted TEXT,
ADD COLUMN IF NOT EXISTS bank_account_encrypted TEXT,
ADD COLUMN IF NOT EXISTS bank_name_encrypted TEXT,
ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;

-- Add encrypted columns to transactions for additional security
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS metadata_encrypted TEXT;

-- Add encrypted columns to wallets for balance protection
ALTER TABLE public.wallets 
ADD COLUMN IF NOT EXISTS balance_checksum TEXT;

-- Create audit log table for tracking sensitive data access
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can write audit logs (edge functions use service role)
CREATE POLICY "Service role can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- Users can only view their own audit logs
CREATE POLICY "Users can view their own audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (user_id = auth.uid());

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (is_admin());

-- Create index for faster audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- Update atomic functions to hide SQL error details
-- Fix process_contribution_atomic
CREATE OR REPLACE FUNCTION public.process_contribution_atomic(
  _user_id UUID,
  _group_id UUID,
  _amount NUMERIC
)
RETURNS JSON
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
BEGIN
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
  
  -- Check if all members have contributed
  SELECT COUNT(*) INTO v_member_count
  FROM public.group_memberships
  WHERE group_id = _group_id AND status = 'active';
  
  SELECT COUNT(*) INTO v_contribution_count
  FROM public.cycle_contributions
  WHERE cycle_id = v_cycle_id AND status = 'completed';
  
  v_all_contributed := v_member_count = v_contribution_count;
  
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

-- Fix process_payout_atomic
CREATE OR REPLACE FUNCTION public.process_payout_atomic(
  _admin_id UUID,
  _group_id UUID
)
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
BEGIN
  -- Verify admin owns this group
  SELECT * INTO v_group
  FROM public.thrift_groups
  WHERE id = _group_id AND admin_id = _admin_id
  FOR UPDATE;
  
  IF v_group IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Access denied');
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
  VALUES (_admin_id, 'service_fee', v_platform_fee, 'completed', _group_id, 'Platform service fee');
  
  -- Update recipient membership
  UPDATE public.group_memberships
  SET has_received_payout = true
  WHERE group_id = _group_id AND user_id = v_recipient_id;
  
  -- Reset contribution flags for next cycle
  UPDATE public.group_memberships
  SET has_contributed_this_cycle = false
  WHERE group_id = _group_id;
  
  -- Advance payout position
  UPDATE public.thrift_groups
  SET current_payout_position = current_payout_position + 1,
      current_cycle = current_cycle + 1,
      updated_at = now()
  WHERE id = _group_id;
  
  -- Complete current cycle
  UPDATE public.contribution_cycles
  SET status = 'completed',
      completed_at = now(),
      payout_amount = v_net_amount,
      platform_fee = v_platform_fee,
      payout_recipient_id = v_recipient_id
  WHERE id = v_cycle.id;
  
  RETURN json_build_object(
    'success', true,
    'recipient_id', v_recipient_id,
    'net_amount', v_net_amount,
    'platform_fee', v_platform_fee
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in process_payout_atomic: % %', SQLERRM, SQLSTATE;
    RETURN json_build_object('success', false, 'error', 'Operation failed');
END;
$$;

-- Fix credit_wallet_atomic
CREATE OR REPLACE FUNCTION public.credit_wallet_atomic(
  _user_id UUID,
  _amount NUMERIC,
  _tx_ref TEXT,
  _description TEXT DEFAULT 'Wallet funding'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_new_balance NUMERIC;
  v_tx_exists BOOLEAN;
BEGIN
  -- Check for duplicate transaction (idempotency)
  SELECT EXISTS(
    SELECT 1 FROM public.transactions
    WHERE reference = _tx_ref AND status = 'completed'
  ) INTO v_tx_exists;
  
  IF v_tx_exists THEN
    RETURN json_build_object('success', true, 'message', 'Transaction already processed', 'duplicate', true);
  END IF;
  
  -- Get and lock wallet
  SELECT id INTO v_wallet_id
  FROM public.wallets
  WHERE user_id = _user_id
  FOR UPDATE;
  
  -- Create wallet if not exists
  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, available_balance, locked_balance)
    VALUES (_user_id, 0, 0)
    RETURNING id INTO v_wallet_id;
  END IF;
  
  -- Credit wallet
  UPDATE public.wallets
  SET available_balance = available_balance + _amount,
      updated_at = now()
  WHERE id = v_wallet_id
  RETURNING available_balance INTO v_new_balance;
  
  -- Record or update transaction
  INSERT INTO public.transactions (user_id, type, amount, status, reference, description, wallet_id)
  VALUES (_user_id, 'funding', _amount, 'completed', _tx_ref, _description, v_wallet_id)
  ON CONFLICT (reference) DO UPDATE SET status = 'completed';
  
  RETURN json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'amount_credited', _amount
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in credit_wallet_atomic: % %', SQLERRM, SQLSTATE;
    RETURN json_build_object('success', false, 'error', 'Operation failed');
END;
$$;

-- Create function to log audit events
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _user_id UUID,
  _action TEXT,
  _resource_type TEXT,
  _resource_id TEXT DEFAULT NULL,
  _details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (_user_id, _action, _resource_type, _resource_id, _details)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Failed to log audit event: %', SQLERRM;
    RETURN NULL;
END;
$$;