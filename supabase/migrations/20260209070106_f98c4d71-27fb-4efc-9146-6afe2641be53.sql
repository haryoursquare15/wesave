-- 1. Create function to check user's active group count and enforce 2-group limit
CREATE OR REPLACE FUNCTION public.check_group_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active_group_count INT;
BEGIN
  -- Count active memberships for this user
  SELECT COUNT(*) INTO _active_group_count
  FROM group_memberships
  WHERE user_id = NEW.user_id
    AND status = 'active';

  -- Enforce maximum of 2 active groups
  IF _active_group_count >= 2 THEN
    RAISE EXCEPTION 'You can only be a member of up to 2 active groups at a time';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create trigger to enforce group limit on membership insert
DROP TRIGGER IF EXISTS enforce_group_limit ON group_memberships;
CREATE TRIGGER enforce_group_limit
  BEFORE INSERT ON group_memberships
  FOR EACH ROW
  EXECUTE FUNCTION check_group_limit();

-- 3. Update gamification: award badge upgrades when cycle is completed
-- This function will be called after a payout to update credit scores and badges
CREATE OR REPLACE FUNCTION public.award_cycle_completion(
  _user_id uuid,
  _group_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_score INT;
  _new_score INT;
  _current_tier TEXT;
  _new_tier TEXT;
  _cycles_completed INT;
BEGIN
  -- Get current profile data
  SELECT credit_score, membership_tier, completed_cycles
  INTO _current_score, _current_tier, _cycles_completed
  FROM profiles
  WHERE id = _user_id;

  -- Award points for completing a cycle (50 points per cycle)
  _new_score := LEAST(_current_score + 50, 850);
  _cycles_completed := COALESCE(_cycles_completed, 0) + 1;

  -- Determine new tier based on cycles and score
  IF _cycles_completed >= 10 AND _new_score >= 750 THEN
    _new_tier := 'gold';
  ELSIF _cycles_completed >= 5 AND _new_score >= 670 THEN
    _new_tier := 'silver';
  ELSIF _cycles_completed >= 2 AND _new_score >= 580 THEN
    _new_tier := 'bronze';
  ELSE
    _new_tier := 'newbie';
  END IF;

  -- Update profile
  UPDATE profiles
  SET 
    credit_score = _new_score,
    completed_cycles = _cycles_completed,
    membership_tier = _new_tier::membership_tier,
    updated_at = now()
  WHERE id = _user_id;

  -- Record credit score change
  INSERT INTO credit_score_history (
    user_id, score_before, score_after, change_amount, 
    change_reason, reference_type, reference_id
  ) VALUES (
    _user_id, _current_score, _new_score, 50,
    'Completed thrift cycle', 'group', _group_id::text
  );
END;
$$;

-- 4. Update process_payout_internal to call gamification after payout
CREATE OR REPLACE FUNCTION public.process_payout_internal(
  _group_id uuid,
  _cycle_id uuid,
  _recipient_id uuid,
  _gross_amount numeric,
  _platform_fee numeric,
  _net_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payout_id uuid;
  _wallet_id uuid;
  _group_name text;
BEGIN
  -- Get recipient's wallet and group name
  SELECT id INTO _wallet_id FROM wallets WHERE user_id = _recipient_id;
  SELECT name INTO _group_name FROM thrift_groups WHERE id = _group_id;
  
  IF _wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipient has no wallet');
  END IF;

  -- Create payout record
  INSERT INTO payouts (
    group_id, cycle_id, recipient_id,
    gross_amount, platform_fee, net_amount,
    status, processed_at
  ) VALUES (
    _group_id, _cycle_id, _recipient_id,
    _gross_amount, _platform_fee, _net_amount,
    'completed', now()
  ) RETURNING id INTO _payout_id;

  -- Credit recipient's wallet via ledger
  PERFORM credit_wallet_via_ledger(
    _recipient_id,
    _net_amount,
    'payout',
    'payout',
    _payout_id::text,
    'Group payout from ' || _group_name
  );

  -- Record platform fee in revenue ledger
  PERFORM record_platform_fee(_payout_id, _platform_fee, 'payout_fee', _group_id, _recipient_id);

  -- Mark recipient as having received payout
  UPDATE group_memberships
  SET has_received_payout = true
  WHERE group_id = _group_id AND user_id = _recipient_id;

  -- Update cycle
  UPDATE contribution_cycles
  SET 
    payout_amount = _net_amount,
    payout_date = now(),
    payout_recipient_id = _recipient_id,
    platform_fee = _platform_fee,
    status = 'completed',
    completed_at = now()
  WHERE id = _cycle_id;

  -- Award gamification points for cycle completion
  PERFORM award_cycle_completion(_recipient_id, _group_id);

  RETURN json_build_object(
    'success', true,
    'payout_id', _payout_id,
    'net_amount', _net_amount
  );
END;
$$;