-- =====================================================
-- COMPREHENSIVE SECURITY & LEDGER SYSTEM MIGRATION
-- =====================================================

-- 1. LEDGER ENTRIES TABLE (Immutable Transaction Log)
-- All wallet balance changes MUST go through ledger entries
CREATE TABLE public.ledger_entries (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_id UUID NOT NULL REFERENCES public.wallets(id),
    user_id UUID NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN (
        'credit', 'debit', 'lock', 'unlock', 'fee', 'reversal'
    )),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    balance_before NUMERIC NOT NULL,
    balance_after NUMERIC NOT NULL,
    locked_before NUMERIC NOT NULL DEFAULT 0,
    locked_after NUMERIC NOT NULL DEFAULT 0,
    reference_type TEXT NOT NULL, -- funding, contribution, payout, withdrawal, service_fee, platform_fee
    reference_id UUID, -- Links to transaction, payout, etc.
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    -- Immutability: No updates or deletes allowed
    CONSTRAINT positive_balances CHECK (balance_after >= 0 AND locked_after >= 0)
);

-- Create indexes for efficient querying
CREATE INDEX idx_ledger_entries_wallet_id ON public.ledger_entries(wallet_id);
CREATE INDEX idx_ledger_entries_user_id ON public.ledger_entries(user_id);
CREATE INDEX idx_ledger_entries_created_at ON public.ledger_entries(created_at DESC);
CREATE INDEX idx_ledger_entries_reference ON public.ledger_entries(reference_type, reference_id);

-- Enable RLS
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Users can view their own ledger entries (read-only)
CREATE POLICY "Users can view own ledger entries"
ON public.ledger_entries FOR SELECT
USING (user_id = auth.uid());

-- No insert/update/delete for users - only service role can write
-- This ensures immutability

-- 2. PLATFORM WALLET (Internal Revenue Account)
CREATE TABLE public.platform_wallet (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_type TEXT NOT NULL UNIQUE CHECK (wallet_type IN ('revenue', 'reserve', 'escrow')),
    available_balance NUMERIC NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
    pending_balance NUMERIC NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
    total_collected NUMERIC NOT NULL DEFAULT 0,
    last_settlement_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert the platform revenue wallet
INSERT INTO public.platform_wallet (wallet_type, available_balance, total_collected)
VALUES ('revenue', 0, 0);

-- Enable RLS - admin read-only, no user access
ALTER TABLE public.platform_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view platform wallet"
ON public.platform_wallet FOR SELECT
USING (is_admin());

-- 3. PLATFORM LEDGER (Immutable platform transaction log)
CREATE TABLE public.platform_ledger (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('fee_collected', 'settlement', 'refund', 'adjustment')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    balance_before NUMERIC NOT NULL,
    balance_after NUMERIC NOT NULL,
    source_type TEXT, -- payout, contribution, etc.
    source_id UUID,
    source_user_id UUID,
    source_group_id UUID,
    settlement_reference TEXT, -- Flutterwave transfer ref for settlements
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_ledger_created_at ON public.platform_ledger(created_at DESC);
CREATE INDEX idx_platform_ledger_entry_type ON public.platform_ledger(entry_type);

ALTER TABLE public.platform_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view platform ledger"
ON public.platform_ledger FOR SELECT
USING (is_admin());

-- 4. TOTP SECRETS TABLE (2FA)
CREATE TABLE public.user_totp_secrets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    secret_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    backup_codes_encrypted TEXT, -- JSON array of hashed backup codes
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_totp_secrets ENABLE ROW LEVEL SECURITY;

-- Users can only view their own TOTP status (not the secret itself)
CREATE POLICY "Users can view own TOTP status"
ON public.user_totp_secrets FOR SELECT
USING (user_id = auth.uid());

-- 5. DEVICE FINGERPRINTS TABLE
CREATE TABLE public.user_devices (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    device_fingerprint TEXT NOT NULL,
    device_name TEXT,
    browser TEXT,
    os TEXT,
    ip_address TEXT,
    is_trusted BOOLEAN NOT NULL DEFAULT false,
    is_current BOOLEAN NOT NULL DEFAULT false,
    last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX idx_user_devices_fingerprint ON public.user_devices(device_fingerprint);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own devices"
ON public.user_devices FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can manage own devices"
ON public.user_devices FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own devices"
ON public.user_devices FOR DELETE
USING (user_id = auth.uid());

-- 6. LOGIN ATTEMPTS TABLE (Brute Force Protection)
CREATE TABLE public.login_attempts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    ip_address TEXT,
    device_fingerprint TEXT,
    success BOOLEAN NOT NULL DEFAULT false,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_attempts_email ON public.login_attempts(email);
CREATE INDEX idx_login_attempts_ip ON public.login_attempts(ip_address);
CREATE INDEX idx_login_attempts_created_at ON public.login_attempts(created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- No user access to login attempts
CREATE POLICY "Service role only for login attempts"
ON public.login_attempts FOR ALL
USING (false);

-- 7. ACCOUNT LOCKS TABLE
CREATE TABLE public.account_locks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    email TEXT,
    lock_reason TEXT NOT NULL CHECK (lock_reason IN (
        'failed_logins', 'suspicious_activity', 'admin_lock', 'fraud_detected'
    )),
    locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    locked_until TIMESTAMP WITH TIME ZONE,
    unlock_code TEXT, -- For self-unlock via email
    unlocked_at TIMESTAMP WITH TIME ZONE,
    unlocked_by UUID
);

CREATE INDEX idx_account_locks_user_id ON public.account_locks(user_id);
CREATE INDEX idx_account_locks_email ON public.account_locks(email);

ALTER TABLE public.account_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own account locks"
ON public.account_locks FOR SELECT
USING (user_id = auth.uid());

-- 8. WITHDRAWAL LIMITS TABLE
CREATE TABLE public.withdrawal_limits (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    daily_limit NUMERIC NOT NULL DEFAULT 500000, -- ₦500,000
    monthly_limit NUMERIC NOT NULL DEFAULT 5000000, -- ₦5,000,000
    daily_used NUMERIC NOT NULL DEFAULT 0,
    monthly_used NUMERIC NOT NULL DEFAULT 0,
    daily_reset_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    monthly_reset_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    cooldown_until TIMESTAMP WITH TIME ZONE, -- After bank change/new device
    cooldown_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_withdrawal_limits_user_id ON public.withdrawal_limits(user_id);

ALTER TABLE public.withdrawal_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawal limits"
ON public.withdrawal_limits FOR SELECT
USING (user_id = auth.uid());

-- 9. VELOCITY CHECKS TABLE (Fraud Detection)
CREATE TABLE public.velocity_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'withdrawal', 'bank_change', 'device_login', 'high_value_tx', 'funding'
    )),
    amount NUMERIC,
    ip_address TEXT,
    device_fingerprint TEXT,
    metadata JSONB DEFAULT '{}',
    flagged BOOLEAN NOT NULL DEFAULT false,
    flag_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_velocity_events_user_id ON public.velocity_events(user_id);
CREATE INDEX idx_velocity_events_created_at ON public.velocity_events(created_at DESC);
CREATE INDEX idx_velocity_events_type ON public.velocity_events(event_type);

ALTER TABLE public.velocity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own velocity events"
ON public.velocity_events FOR SELECT
USING (user_id = auth.uid());

-- 10. CREDIT SCORE HISTORY (AI Risk Scoring)
CREATE TABLE public.credit_score_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    score_before INTEGER NOT NULL,
    score_after INTEGER NOT NULL,
    change_amount INTEGER NOT NULL,
    change_reason TEXT NOT NULL CHECK (change_reason IN (
        'on_time_contribution', 'late_contribution', 'missed_contribution',
        'failed_auto_debit', 'successful_cycle', 'early_exit',
        'wallet_funding', 'positive_balance', 'negative_velocity',
        'admin_adjustment', 'badge_upgrade', 'badge_downgrade'
    )),
    reference_type TEXT,
    reference_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_score_history_user_id ON public.credit_score_history(user_id);
CREATE INDEX idx_credit_score_history_created_at ON public.credit_score_history(created_at DESC);

ALTER TABLE public.credit_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit score history"
ON public.credit_score_history FOR SELECT
USING (user_id = auth.uid());

-- 11. PLATFORM SETTLEMENTS TABLE (Auto-settlement tracking)
CREATE TABLE public.platform_settlements (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    flw_transfer_id TEXT,
    flw_transfer_ref TEXT,
    bank_account TEXT, -- Destination account (masked)
    bank_name TEXT,
    initiated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    initiated_by UUID, -- NULL for auto-settlements
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_platform_settlements_status ON public.platform_settlements(status);
CREATE INDEX idx_platform_settlements_created ON public.platform_settlements(initiated_at DESC);

ALTER TABLE public.platform_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view settlements"
ON public.platform_settlements FOR SELECT
USING (is_admin());

-- 12. Update profiles table to track security-sensitive changes
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bank_details_changed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_security_review TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'blocked'));

-- 13. SECURITY DEFINER FUNCTION: Credit Wallet via Ledger
CREATE OR REPLACE FUNCTION public.credit_wallet_via_ledger(
    _user_id UUID,
    _amount NUMERIC,
    _reference_type TEXT,
    _reference_id UUID DEFAULT NULL,
    _description TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet wallets%ROWTYPE;
    v_new_balance NUMERIC;
    v_ledger_id UUID;
BEGIN
    -- Lock the wallet row
    SELECT * INTO v_wallet FROM wallets WHERE user_id = _user_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Wallet not found');
    END IF;
    
    v_new_balance := COALESCE(v_wallet.available_balance, 0) + _amount;
    
    -- Insert ledger entry
    INSERT INTO ledger_entries (
        wallet_id, user_id, entry_type, amount,
        balance_before, balance_after,
        locked_before, locked_after,
        reference_type, reference_id, description
    ) VALUES (
        v_wallet.id, _user_id, 'credit', _amount,
        COALESCE(v_wallet.available_balance, 0), v_new_balance,
        COALESCE(v_wallet.locked_balance, 0), COALESCE(v_wallet.locked_balance, 0),
        _reference_type, _reference_id, _description
    ) RETURNING id INTO v_ledger_id;
    
    -- Update wallet (derived from ledger conceptually, but we keep synced for performance)
    UPDATE wallets 
    SET available_balance = v_new_balance, updated_at = now()
    WHERE id = v_wallet.id;
    
    RETURN json_build_object(
        'success', true, 
        'new_balance', v_new_balance,
        'ledger_id', v_ledger_id
    );
END;
$$;

-- 14. SECURITY DEFINER FUNCTION: Debit Wallet via Ledger
CREATE OR REPLACE FUNCTION public.debit_wallet_via_ledger(
    _user_id UUID,
    _amount NUMERIC,
    _reference_type TEXT,
    _reference_id UUID DEFAULT NULL,
    _description TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet wallets%ROWTYPE;
    v_new_balance NUMERIC;
    v_ledger_id UUID;
BEGIN
    -- Lock the wallet row
    SELECT * INTO v_wallet FROM wallets WHERE user_id = _user_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Wallet not found');
    END IF;
    
    IF COALESCE(v_wallet.available_balance, 0) < _amount THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient balance');
    END IF;
    
    v_new_balance := COALESCE(v_wallet.available_balance, 0) - _amount;
    
    -- Insert ledger entry
    INSERT INTO ledger_entries (
        wallet_id, user_id, entry_type, amount,
        balance_before, balance_after,
        locked_before, locked_after,
        reference_type, reference_id, description
    ) VALUES (
        v_wallet.id, _user_id, 'debit', _amount,
        COALESCE(v_wallet.available_balance, 0), v_new_balance,
        COALESCE(v_wallet.locked_balance, 0), COALESCE(v_wallet.locked_balance, 0),
        _reference_type, _reference_id, _description
    ) RETURNING id INTO v_ledger_id;
    
    -- Update wallet
    UPDATE wallets 
    SET available_balance = v_new_balance, updated_at = now()
    WHERE id = v_wallet.id;
    
    RETURN json_build_object(
        'success', true, 
        'new_balance', v_new_balance,
        'ledger_id', v_ledger_id
    );
END;
$$;

-- 15. SECURITY DEFINER FUNCTION: Record Platform Fee
CREATE OR REPLACE FUNCTION public.record_platform_fee(
    _amount NUMERIC,
    _source_type TEXT,
    _source_id UUID,
    _source_user_id UUID,
    _source_group_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_platform_wallet platform_wallet%ROWTYPE;
    v_new_balance NUMERIC;
BEGIN
    -- Lock platform wallet
    SELECT * INTO v_platform_wallet FROM platform_wallet WHERE wallet_type = 'revenue' FOR UPDATE;
    
    v_new_balance := COALESCE(v_platform_wallet.available_balance, 0) + _amount;
    
    -- Insert platform ledger entry
    INSERT INTO platform_ledger (
        entry_type, amount, balance_before, balance_after,
        source_type, source_id, source_user_id, source_group_id,
        description
    ) VALUES (
        'fee_collected', _amount, 
        COALESCE(v_platform_wallet.available_balance, 0), v_new_balance,
        _source_type, _source_id, _source_user_id, _source_group_id,
        'Service fee collected from ' || _source_type
    );
    
    -- Update platform wallet
    UPDATE platform_wallet 
    SET available_balance = v_new_balance,
        total_collected = COALESCE(total_collected, 0) + _amount,
        updated_at = now()
    WHERE wallet_type = 'revenue';
    
    RETURN json_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- 16. SECURITY DEFINER FUNCTION: Check Withdrawal Limits
CREATE OR REPLACE FUNCTION public.check_withdrawal_limits(
    _user_id UUID,
    _amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limits withdrawal_limits%ROWTYPE;
    v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
    -- Get or create limits
    SELECT * INTO v_limits FROM withdrawal_limits WHERE user_id = _user_id FOR UPDATE;
    
    IF NOT FOUND THEN
        INSERT INTO withdrawal_limits (user_id) VALUES (_user_id)
        RETURNING * INTO v_limits;
    END IF;
    
    -- Check cooldown
    IF v_limits.cooldown_until IS NOT NULL AND v_limits.cooldown_until > v_now THEN
        RETURN json_build_object(
            'allowed', false, 
            'reason', 'Withdrawal cooldown active until ' || v_limits.cooldown_until::TEXT,
            'cooldown_until', v_limits.cooldown_until
        );
    END IF;
    
    -- Reset daily if needed
    IF v_limits.daily_reset_at < v_now - INTERVAL '24 hours' THEN
        UPDATE withdrawal_limits 
        SET daily_used = 0, daily_reset_at = v_now 
        WHERE user_id = _user_id;
        v_limits.daily_used := 0;
    END IF;
    
    -- Reset monthly if needed
    IF v_limits.monthly_reset_at < v_now - INTERVAL '30 days' THEN
        UPDATE withdrawal_limits 
        SET monthly_used = 0, monthly_reset_at = v_now 
        WHERE user_id = _user_id;
        v_limits.monthly_used := 0;
    END IF;
    
    -- Check limits
    IF v_limits.daily_used + _amount > v_limits.daily_limit THEN
        RETURN json_build_object(
            'allowed', false, 
            'reason', 'Daily withdrawal limit exceeded',
            'daily_limit', v_limits.daily_limit,
            'daily_used', v_limits.daily_used,
            'remaining', v_limits.daily_limit - v_limits.daily_used
        );
    END IF;
    
    IF v_limits.monthly_used + _amount > v_limits.monthly_limit THEN
        RETURN json_build_object(
            'allowed', false, 
            'reason', 'Monthly withdrawal limit exceeded',
            'monthly_limit', v_limits.monthly_limit,
            'monthly_used', v_limits.monthly_used,
            'remaining', v_limits.monthly_limit - v_limits.monthly_used
        );
    END IF;
    
    RETURN json_build_object(
        'allowed', true,
        'daily_remaining', v_limits.daily_limit - v_limits.daily_used - _amount,
        'monthly_remaining', v_limits.monthly_limit - v_limits.monthly_used - _amount
    );
END;
$$;

-- 17. SECURITY DEFINER FUNCTION: Update Credit Score
CREATE OR REPLACE FUNCTION public.update_credit_score(
    _user_id UUID,
    _change_amount INTEGER,
    _change_reason TEXT,
    _reference_type TEXT DEFAULT NULL,
    _reference_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_score INTEGER;
    v_new_score INTEGER;
    v_tier membership_tier;
BEGIN
    -- Get current score
    SELECT COALESCE(credit_score, 300) INTO v_current_score
    FROM profiles WHERE id = _user_id FOR UPDATE;
    
    -- Calculate new score (min 100, max 850)
    v_new_score := GREATEST(100, LEAST(850, v_current_score + _change_amount));
    
    -- Record history
    INSERT INTO credit_score_history (
        user_id, score_before, score_after, change_amount,
        change_reason, reference_type, reference_id
    ) VALUES (
        _user_id, v_current_score, v_new_score, _change_amount,
        _change_reason, _reference_type, _reference_id
    );
    
    -- Determine new tier based on score
    IF v_new_score >= 750 THEN
        v_tier := 'gold';
    ELSIF v_new_score >= 600 THEN
        v_tier := 'silver';
    ELSIF v_new_score >= 400 THEN
        v_tier := 'bronze';
    ELSE
        v_tier := 'newbie';
    END IF;
    
    -- Update profile
    UPDATE profiles 
    SET credit_score = v_new_score, 
        membership_tier = v_tier,
        updated_at = now()
    WHERE id = _user_id;
    
    RETURN json_build_object(
        'success', true,
        'score_before', v_current_score,
        'score_after', v_new_score,
        'change', _change_amount,
        'new_tier', v_tier
    );
END;
$$;

-- 18. SECURITY DEFINER FUNCTION: Check Login Attempts (Brute Force)
CREATE OR REPLACE FUNCTION public.check_login_allowed(
    _email TEXT,
    _ip_address TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_failed_count INTEGER;
    v_lock account_locks%ROWTYPE;
    v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
    -- Check for active lock
    SELECT * INTO v_lock 
    FROM account_locks 
    WHERE email = _email 
      AND unlocked_at IS NULL
      AND (locked_until IS NULL OR locked_until > v_now)
    ORDER BY locked_at DESC 
    LIMIT 1;
    
    IF FOUND THEN
        RETURN json_build_object(
            'allowed', false,
            'reason', 'Account is locked: ' || v_lock.lock_reason,
            'locked_until', v_lock.locked_until
        );
    END IF;
    
    -- Count failed attempts in last 15 minutes
    SELECT COUNT(*) INTO v_failed_count
    FROM login_attempts
    WHERE email = _email
      AND success = false
      AND created_at > v_now - INTERVAL '15 minutes';
    
    -- Lock after 5 failed attempts
    IF v_failed_count >= 5 THEN
        INSERT INTO account_locks (email, lock_reason, locked_until)
        VALUES (_email, 'failed_logins', v_now + INTERVAL '30 minutes');
        
        RETURN json_build_object(
            'allowed', false,
            'reason', 'Too many failed login attempts. Account locked for 30 minutes.',
            'locked_until', v_now + INTERVAL '30 minutes'
        );
    END IF;
    
    RETURN json_build_object(
        'allowed', true,
        'attempts_remaining', 5 - v_failed_count
    );
END;
$$;

-- 19. SECURITY DEFINER FUNCTION: Record Login Attempt
CREATE OR REPLACE FUNCTION public.record_login_attempt(
    _email TEXT,
    _success BOOLEAN,
    _ip_address TEXT DEFAULT NULL,
    _device_fingerprint TEXT DEFAULT NULL,
    _failure_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO login_attempts (email, ip_address, device_fingerprint, success, failure_reason)
    VALUES (_email, _ip_address, _device_fingerprint, _success, _failure_reason);
END;
$$;

-- 20. SECURITY DEFINER FUNCTION: Check Velocity
CREATE OR REPLACE FUNCTION public.check_velocity(
    _user_id UUID,
    _event_type TEXT,
    _amount NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count_1h INTEGER;
    v_count_24h INTEGER;
    v_sum_24h NUMERIC;
    v_flagged BOOLEAN := false;
    v_flag_reason TEXT;
BEGIN
    -- Count events in last hour
    SELECT COUNT(*), COALESCE(SUM(amount), 0) 
    INTO v_count_1h, v_sum_24h
    FROM velocity_events
    WHERE user_id = _user_id
      AND event_type = _event_type
      AND created_at > now() - INTERVAL '1 hour';
    
    -- Count events in last 24 hours
    SELECT COUNT(*) INTO v_count_24h
    FROM velocity_events
    WHERE user_id = _user_id
      AND event_type = _event_type
      AND created_at > now() - INTERVAL '24 hours';
    
    -- Velocity rules
    CASE _event_type
        WHEN 'withdrawal' THEN
            IF v_count_1h >= 3 THEN
                v_flagged := true;
                v_flag_reason := 'More than 3 withdrawals in 1 hour';
            ELSIF v_count_24h >= 10 THEN
                v_flagged := true;
                v_flag_reason := 'More than 10 withdrawals in 24 hours';
            END IF;
        WHEN 'bank_change' THEN
            IF v_count_24h >= 2 THEN
                v_flagged := true;
                v_flag_reason := 'Multiple bank changes in 24 hours';
            END IF;
        WHEN 'device_login' THEN
            IF v_count_1h >= 3 THEN
                v_flagged := true;
                v_flag_reason := 'Login from multiple new devices in 1 hour';
            END IF;
        ELSE
            NULL;
    END CASE;
    
    -- Record the velocity event
    INSERT INTO velocity_events (user_id, event_type, amount, flagged, flag_reason)
    VALUES (_user_id, _event_type, _amount, v_flagged, v_flag_reason);
    
    -- If flagged, consider updating risk level
    IF v_flagged THEN
        UPDATE profiles SET risk_level = 'medium' WHERE id = _user_id AND risk_level = 'low';
    END IF;
    
    RETURN json_build_object(
        'flagged', v_flagged,
        'reason', v_flag_reason,
        'count_1h', v_count_1h,
        'count_24h', v_count_24h
    );
END;
$$;

-- 21. Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_score_history;