
-- Referrals table
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  fraud_flag boolean DEFAULT false,
  fraud_reason text,
  reward_amount numeric DEFAULT 1000,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  rewarded_at timestamptz,
  UNIQUE(referred_user_id)
);

-- Add referral columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid;

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view referrals they made
CREATE POLICY "Users can view referrals they made" ON public.referrals
  FOR SELECT USING (referrer_id = auth.uid());

-- RLS: Users can view their own referral record
CREATE POLICY "Users can view own referral record" ON public.referrals
  FOR SELECT USING (referred_user_id = auth.uid());

-- RLS: Admins can view all referrals
CREATE POLICY "Admins can view all referrals" ON public.referrals
  FOR SELECT USING (is_any_admin(auth.uid()));

-- RLS: Admins can update referrals (manual review)
CREATE POLICY "Admins can update referrals" ON public.referrals
  FOR UPDATE USING (is_any_admin(auth.uid()));

-- Generate referral code trigger
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := lower(substr(md5(NEW.id::text || extract(epoch from now())::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_referral_code
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.referral_code IS NULL)
  EXECUTE FUNCTION generate_referral_code();

-- Process referral reward RPC (SECURITY DEFINER, service_role only)
CREATE OR REPLACE FUNCTION process_referral_reward(
  p_referred_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral record;
  v_referrer_wallet record;
  v_reward_amount numeric := 1000;
  v_ledger_id uuid;
BEGIN
  -- Find the referral
  SELECT * INTO v_referral FROM referrals
  WHERE referred_user_id = p_referred_user_id
    AND status = 'pending'
    AND fraud_flag = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_eligible_referral');
  END IF;

  -- Self-referral check
  IF v_referral.referrer_id = p_referred_user_id THEN
    UPDATE referrals SET fraud_flag = true, fraud_reason = 'self_referral'
    WHERE id = v_referral.id;
    RETURN jsonb_build_object('success', false, 'reason', 'self_referral');
  END IF;

  -- Get referrer wallet
  SELECT * INTO v_referrer_wallet FROM wallets
  WHERE user_id = v_referral.referrer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_wallet');
  END IF;

  -- Credit to locked_balance (liened)
  UPDATE wallets
  SET locked_balance = COALESCE(locked_balance, 0) + v_reward_amount,
      updated_at = now()
  WHERE id = v_referrer_wallet.id;

  -- Create ledger entry
  INSERT INTO ledger_entries (
    wallet_id, user_id, amount, entry_type, reference_type, reference_id,
    balance_before, balance_after, locked_before, locked_after, description
  ) VALUES (
    v_referrer_wallet.id,
    v_referral.referrer_id,
    v_reward_amount,
    'credit',
    'referral_bonus',
    v_referral.id::text,
    COALESCE(v_referrer_wallet.available_balance, 0),
    COALESCE(v_referrer_wallet.available_balance, 0),
    COALESCE(v_referrer_wallet.locked_balance, 0),
    COALESCE(v_referrer_wallet.locked_balance, 0) + v_reward_amount,
    'Referral bonus - liened until you complete a thrift cycle'
  ) RETURNING id INTO v_ledger_id;

  -- Update referral status
  UPDATE referrals
  SET status = 'rewarded', rewarded_at = now(), completed_at = now()
  WHERE id = v_referral.id;

  -- Create notification for referrer
  INSERT INTO user_notifications (user_id, title, message, notification_type)
  VALUES (
    v_referral.referrer_id,
    'Referral Bonus Earned! 🎉',
    'You earned ₦1,000 referral bonus! It has been credited and will unlock after you complete a thrift cycle.',
    'referral_reward'
  );

  RETURN jsonb_build_object('success', true, 'reward_amount', v_reward_amount, 'ledger_id', v_ledger_id);
END;
$$;

-- Release referral liens RPC
CREATE OR REPLACE FUNCTION release_referral_liens(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet record;
  v_total_liened numeric := 0;
  v_lien_entries record;
BEGIN
  -- Check if user has completed at least 1 cycle
  IF NOT EXISTS (
    SELECT 1 FROM contribution_cycles cc
    JOIN group_memberships gm ON gm.group_id = cc.group_id AND gm.user_id = p_user_id
    WHERE cc.status = 'completed'
    AND cc.payout_recipient_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_completed_cycle');
  END IF;

  -- Get wallet
  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_wallet');
  END IF;

  -- Sum liened referral bonuses
  SELECT COALESCE(SUM(le.amount), 0) INTO v_total_liened
  FROM ledger_entries le
  WHERE le.user_id = p_user_id
    AND le.reference_type = 'referral_bonus'
    AND le.description LIKE '%liened%';

  IF v_total_liened <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_liens_to_release');
  END IF;

  -- Move from locked to available
  UPDATE wallets
  SET available_balance = COALESCE(available_balance, 0) + v_total_liened,
      locked_balance = GREATEST(COALESCE(locked_balance, 0) - v_total_liened, 0),
      updated_at = now()
  WHERE id = v_wallet.id;

  -- Create ledger entry for release
  INSERT INTO ledger_entries (
    wallet_id, user_id, amount, entry_type, reference_type, reference_id,
    balance_before, balance_after, locked_before, locked_after, description
  ) VALUES (
    v_wallet.id,
    p_user_id,
    v_total_liened,
    'credit',
    'referral_lien_release',
    'lien-release-' || p_user_id::text,
    COALESCE(v_wallet.available_balance, 0),
    COALESCE(v_wallet.available_balance, 0) + v_total_liened,
    COALESCE(v_wallet.locked_balance, 0),
    GREATEST(COALESCE(v_wallet.locked_balance, 0) - v_total_liened, 0),
    'Referral bonus liens released - thrift cycle completed'
  );

  -- Notify user
  INSERT INTO user_notifications (user_id, title, message, notification_type)
  VALUES (
    p_user_id,
    'Referral Bonus Unlocked! 🎊',
    'Your ₦' || v_total_liened::text || ' referral bonus is now available for withdrawal.',
    'referral_lien_released'
  );

  RETURN jsonb_build_object('success', true, 'released_amount', v_total_liened);
END;
$$;

-- Revoke direct access to these RPCs (service_role only)
REVOKE EXECUTE ON FUNCTION process_referral_reward FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION release_referral_liens FROM PUBLIC, authenticated, anon;

-- Backfill referral codes for existing users
UPDATE public.profiles
SET referral_code = lower(substr(md5(id::text || extract(epoch from now())::text), 1, 8))
WHERE referral_code IS NULL;
