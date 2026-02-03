-- Fix group creation: Create trigger to auto-add admin as first member when group is created
CREATE OR REPLACE FUNCTION public.auto_add_admin_to_group()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert admin as the first member with payout_position = 1
  INSERT INTO public.group_memberships (
    group_id,
    user_id,
    status,
    payout_position,
    has_contributed_this_cycle,
    has_received_payout
  ) VALUES (
    NEW.id,
    NEW.admin_id,
    'active',
    1,
    false,
    false
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger that fires after group insert
DROP TRIGGER IF EXISTS trigger_auto_add_admin_to_group ON thrift_groups;
CREATE TRIGGER trigger_auto_add_admin_to_group
AFTER INSERT ON thrift_groups
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_admin_to_group();

-- Add action to flutterwave-payments edge function to verify transaction status
-- This will be handled in the edge function

-- Create a function to verify and complete pending transactions
CREATE OR REPLACE FUNCTION public.verify_pending_transaction(tx_ref TEXT, amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_wallet_id UUID;
  v_current_balance NUMERIC;
BEGIN
  -- Get the transaction
  SELECT user_id INTO v_user_id 
  FROM transactions 
  WHERE reference = tx_ref AND status = 'pending';
  
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Get wallet
  SELECT id, available_balance INTO v_wallet_id, v_current_balance
  FROM wallets
  WHERE user_id = v_user_id;
  
  IF v_wallet_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Update wallet balance
  UPDATE wallets 
  SET available_balance = v_current_balance + amount,
      updated_at = NOW()
  WHERE id = v_wallet_id;
  
  -- Update transaction status
  UPDATE transactions
  SET status = 'completed'
  WHERE reference = tx_ref;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;