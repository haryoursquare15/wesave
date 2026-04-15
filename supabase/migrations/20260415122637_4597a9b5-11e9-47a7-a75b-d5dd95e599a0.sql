
-- ============================================================
-- VESTARA DOUBLE-ENTRY LEDGER — PHASE 2: ATOMIC RPCs
-- ============================================================

-- Helper: get or create a product account for a user
CREATE OR REPLACE FUNCTION public.vestara_get_or_create_account(
  _user_id UUID,
  _account_type public.vestara_account_type,
  _label TEXT DEFAULT NULL,
  _group_ref UUID DEFAULT NULL,
  _campaign_ref UUID DEFAULT NULL,
  _split_ref UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _account_id UUID;
BEGIN
  -- Try to find existing
  SELECT id INTO _account_id FROM vestara_accounts
  WHERE user_id = _user_id
    AND account_type = _account_type
    AND COALESCE(group_ref, '00000000-0000-0000-0000-000000000000') = COALESCE(_group_ref, '00000000-0000-0000-0000-000000000000')
    AND COALESCE(campaign_ref, '00000000-0000-0000-0000-000000000000') = COALESCE(_campaign_ref, '00000000-0000-0000-0000-000000000000')
    AND COALESCE(split_ref, '00000000-0000-0000-0000-000000000000') = COALESCE(_split_ref, '00000000-0000-0000-0000-000000000000')
  LIMIT 1;

  IF _account_id IS NULL THEN
    INSERT INTO vestara_accounts (user_id, account_type, label, group_ref, campaign_ref, split_ref)
    VALUES (_user_id, _account_type, _label, _group_ref, _campaign_ref, _split_ref)
    RETURNING id INTO _account_id;
  END IF;

  RETURN _account_id;
END;
$$;

-- ============================================================
-- CORE ENGINE: vestara_post_transaction
-- ============================================================
CREATE OR REPLACE FUNCTION public.vestara_post_transaction(
  _type public.vestara_tx_type,
  _reference TEXT,
  _amount NUMERIC,
  _initiated_by UUID,
  _entries JSONB,  -- array of {account_id, debit, credit}
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx_id UUID;
  _total_debit NUMERIC := 0;
  _total_credit NUMERIC := 0;
  _entry JSONB;
  _acct_id UUID;
  _debit_amt NUMERIC;
  _credit_amt NUMERIC;
  _current_balance NUMERIC;
  _is_sys BOOLEAN;
BEGIN
  -- Validate entries
  IF _entries IS NULL OR jsonb_array_length(_entries) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least 2 ledger entries required');
  END IF;

  -- Sum debits and credits
  FOR _entry IN SELECT * FROM jsonb_array_elements(_entries) LOOP
    _total_debit := _total_debit + COALESCE((_entry->>'debit')::NUMERIC, 0);
    _total_credit := _total_credit + COALESCE((_entry->>'credit')::NUMERIC, 0);
  END LOOP;

  -- Validate double-entry rule
  IF _total_debit != _total_credit THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Debit/credit mismatch: debit=%s credit=%s', _total_debit, _total_credit));
  END IF;

  IF _total_debit <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction amount must be positive');
  END IF;

  -- Create transaction
  INSERT INTO vestara_transactions (type, status, reference, amount, initiated_by, metadata, completed_at)
  VALUES (_type, 'completed', _reference, _amount, _initiated_by, _metadata, now())
  RETURNING id INTO _tx_id;

  -- Process each entry
  FOR _entry IN SELECT * FROM jsonb_array_elements(_entries) LOOP
    _acct_id := (_entry->>'account_id')::UUID;
    _debit_amt := COALESCE((_entry->>'debit')::NUMERIC, 0);
    _credit_amt := COALESCE((_entry->>'credit')::NUMERIC, 0);

    -- Lock the account row
    SELECT balance, is_system INTO _current_balance, _is_sys
    FROM vestara_accounts WHERE id = _acct_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account % not found', _acct_id;
    END IF;

    -- For non-system accounts, check balance on debits
    IF _debit_amt > 0 AND NOT _is_sys AND (_current_balance - _debit_amt) < 0 THEN
      RAISE EXCEPTION 'Insufficient balance in account %: has %, needs %', _acct_id, _current_balance, _debit_amt;
    END IF;

    -- Insert ledger entry
    INSERT INTO vestara_ledger_entries (transaction_id, account_id, debit, credit)
    VALUES (_tx_id, _acct_id, _debit_amt, _credit_amt);

    -- Update account balance (credit increases, debit decreases)
    UPDATE vestara_accounts
    SET balance = balance - _debit_amt + _credit_amt
    WHERE id = _acct_id;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'transaction_id', _tx_id);
END;
$$;

-- ============================================================
-- PRODUCT RPCs
-- ============================================================

-- DEPOSIT (VFD webhook → user wallet)
CREATE OR REPLACE FUNCTION public.vestara_deposit(
  _user_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet_id UUID;
  _settlement_id UUID;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    _wallet_id := vestara_get_or_create_account(_user_id, 'wallet', 'User Wallet');
  END IF;

  SELECT id INTO _settlement_id FROM vestara_accounts
    WHERE is_system = true AND account_type = 'settlement';

  RETURN vestara_post_transaction(
    'deposit', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _settlement_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata
  );
END;
$$;

-- WITHDRAW (user wallet → settlement)
CREATE OR REPLACE FUNCTION public.vestara_withdraw(
  _user_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet_id UUID;
  _settlement_id UUID;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  SELECT id INTO _settlement_id FROM vestara_accounts
    WHERE is_system = true AND account_type = 'settlement';

  RETURN vestara_post_transaction(
    'withdrawal', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _settlement_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata
  );
END;
$$;

-- LOCK FUNDS (wallet → locked_savings)
CREATE OR REPLACE FUNCTION public.vestara_lock_funds(
  _user_id UUID,
  _amount NUMERIC,
  _duration_months INT,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet_id UUID;
  _lock_id UUID;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  _lock_id := vestara_get_or_create_account(_user_id, 'locked_savings',
    format('Locked Savings (%s months)', _duration_months));

  RETURN vestara_post_transaction(
    'lock', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _lock_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('duration_months', _duration_months)
  );
END;
$$;

-- UNLOCK FUNDS (locked_savings → wallet, with optional penalty → revenue)
CREATE OR REPLACE FUNCTION public.vestara_unlock_funds(
  _user_id UUID,
  _lock_account_id UUID,
  _penalty NUMERIC DEFAULT 0,
  _reference TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet_id UUID;
  _revenue_id UUID;
  _lock_balance NUMERIC;
  _net_amount NUMERIC;
  _entries JSONB;
  _ref TEXT;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;

  SELECT balance INTO _lock_balance FROM vestara_accounts
    WHERE id = _lock_account_id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lock account not found');
  END IF;

  _net_amount := _lock_balance - _penalty;
  _ref := COALESCE(_reference, 'unlock-' || gen_random_uuid()::TEXT);

  _entries := jsonb_build_array(
    jsonb_build_object('account_id', _lock_account_id, 'debit', _lock_balance, 'credit', 0),
    jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _net_amount)
  );

  IF _penalty > 0 THEN
    SELECT id INTO _revenue_id FROM vestara_accounts
      WHERE is_system = true AND account_type = 'revenue';
    _entries := _entries || jsonb_build_array(
      jsonb_build_object('account_id', _revenue_id, 'debit', 0, 'credit', _penalty)
    );
  END IF;

  RETURN vestara_post_transaction(
    'unlock', _ref, _lock_balance, _user_id, _entries,
    _metadata || jsonb_build_object('penalty', _penalty)
  );
END;
$$;

-- THRIFT CONTRIBUTE (wallet → thrift pool)
CREATE OR REPLACE FUNCTION public.vestara_thrift_contribute(
  _user_id UUID,
  _group_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet_id UUID;
  _pool_id UUID;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  _pool_id := vestara_get_or_create_account(NULL, 'thrift_pool',
    'Thrift Pool', _group_id);

  -- Pool account needs user_id = NULL for group accounts. Fix: use a system-like approach
  -- Actually for group pools, user_id is NULL
  SELECT id INTO _pool_id FROM vestara_accounts
    WHERE account_type = 'thrift_pool' AND group_ref = _group_id LIMIT 1;
  IF _pool_id IS NULL THEN
    INSERT INTO vestara_accounts (user_id, account_type, group_ref, label)
    VALUES (NULL, 'thrift_pool', _group_id, 'Thrift Pool')
    RETURNING id INTO _pool_id;
  END IF;

  RETURN vestara_post_transaction(
    'thrift_contribution', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _pool_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('group_id', _group_id)
  );
END;
$$;

-- THRIFT PAYOUT (thrift pool → beneficiary wallet + fee → revenue)
CREATE OR REPLACE FUNCTION public.vestara_thrift_payout(
  _beneficiary_id UUID,
  _group_id UUID,
  _gross_amount NUMERIC,
  _fee NUMERIC DEFAULT 0,
  _reference TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pool_id UUID;
  _wallet_id UUID;
  _revenue_id UUID;
  _net NUMERIC;
  _entries JSONB;
  _ref TEXT;
BEGIN
  SELECT id INTO _pool_id FROM vestara_accounts
    WHERE account_type = 'thrift_pool' AND group_ref = _group_id LIMIT 1;
  IF _pool_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Thrift pool not found');
  END IF;

  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _beneficiary_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    _wallet_id := vestara_get_or_create_account(_beneficiary_id, 'wallet', 'User Wallet');
  END IF;

  _net := _gross_amount - _fee;
  _ref := COALESCE(_reference, 'thrift-payout-' || gen_random_uuid()::TEXT);

  _entries := jsonb_build_array(
    jsonb_build_object('account_id', _pool_id, 'debit', _gross_amount, 'credit', 0),
    jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _net)
  );

  IF _fee > 0 THEN
    SELECT id INTO _revenue_id FROM vestara_accounts
      WHERE is_system = true AND account_type = 'revenue';
    _entries := _entries || jsonb_build_array(
      jsonb_build_object('account_id', _revenue_id, 'debit', 0, 'credit', _fee)
    );
  END IF;

  RETURN vestara_post_transaction(
    'thrift_payout', _ref, _gross_amount, _beneficiary_id, _entries,
    _metadata || jsonb_build_object('group_id', _group_id, 'fee', _fee)
  );
END;
$$;

-- SPLIT PAY (payer wallet → split holding)
CREATE OR REPLACE FUNCTION public.vestara_split_pay(
  _user_id UUID,
  _split_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet_id UUID;
  _holding_id UUID;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  SELECT id INTO _holding_id FROM vestara_accounts
    WHERE account_type = 'split_holding' AND split_ref = _split_id LIMIT 1;
  IF _holding_id IS NULL THEN
    INSERT INTO vestara_accounts (user_id, account_type, split_ref, label)
    VALUES (NULL, 'split_holding', _split_id, 'Split Holding')
    RETURNING id INTO _holding_id;
  END IF;

  RETURN vestara_post_transaction(
    'split_payment', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _holding_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('split_id', _split_id)
  );
END;
$$;

-- SPLIT DISTRIBUTE (split holding → multiple wallets)
CREATE OR REPLACE FUNCTION public.vestara_split_distribute(
  _split_id UUID,
  _recipients JSONB,  -- array of {user_id, amount}
  _reference TEXT,
  _initiated_by UUID,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _holding_id UUID;
  _total NUMERIC := 0;
  _entries JSONB := '[]'::JSONB;
  _recipient JSONB;
  _wallet_id UUID;
BEGIN
  SELECT id INTO _holding_id FROM vestara_accounts
    WHERE account_type = 'split_holding' AND split_ref = _split_id LIMIT 1;
  IF _holding_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split holding not found');
  END IF;

  -- Build credit entries for each recipient
  FOR _recipient IN SELECT * FROM jsonb_array_elements(_recipients) LOOP
    _wallet_id := vestara_get_or_create_account(
      (_recipient->>'user_id')::UUID, 'wallet', 'User Wallet');

    _total := _total + (_recipient->>'amount')::NUMERIC;
    _entries := _entries || jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', (_recipient->>'amount')::NUMERIC)
    );
  END LOOP;

  -- Add debit from holding
  _entries := jsonb_build_array(
    jsonb_build_object('account_id', _holding_id, 'debit', _total, 'credit', 0)
  ) || _entries;

  RETURN vestara_post_transaction(
    'split_distribution', _reference, _total, _initiated_by, _entries,
    _metadata || jsonb_build_object('split_id', _split_id)
  );
END;
$$;

-- CROWDFUND CONTRIBUTE (wallet → campaign account)
CREATE OR REPLACE FUNCTION public.vestara_crowdfund_contribute(
  _user_id UUID,
  _campaign_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet_id UUID;
  _campaign_acct_id UUID;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  SELECT id INTO _campaign_acct_id FROM vestara_accounts
    WHERE account_type = 'crowdfunding_pool' AND campaign_ref = _campaign_id LIMIT 1;
  IF _campaign_acct_id IS NULL THEN
    INSERT INTO vestara_accounts (user_id, account_type, campaign_ref, label)
    VALUES (NULL, 'crowdfunding_pool', _campaign_id, 'Campaign Pool')
    RETURNING id INTO _campaign_acct_id;
  END IF;

  RETURN vestara_post_transaction(
    'crowdfunding_contribution', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _campaign_acct_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('campaign_id', _campaign_id)
  );
END;
$$;

-- CROWDFUND DISBURSE (campaign → beneficiary wallet)
CREATE OR REPLACE FUNCTION public.vestara_crowdfund_disburse(
  _beneficiary_id UUID,
  _campaign_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _campaign_acct_id UUID;
  _wallet_id UUID;
BEGIN
  SELECT id INTO _campaign_acct_id FROM vestara_accounts
    WHERE account_type = 'crowdfunding_pool' AND campaign_ref = _campaign_id LIMIT 1;
  IF _campaign_acct_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Campaign account not found');
  END IF;

  _wallet_id := vestara_get_or_create_account(_beneficiary_id, 'wallet', 'User Wallet');

  RETURN vestara_post_transaction(
    'crowdfunding_disbursement', _reference, _amount, _beneficiary_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _campaign_acct_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('campaign_id', _campaign_id)
  );
END;
$$;

-- ACCRUE INTEREST (interest_expense → accrued_interest)
CREATE OR REPLACE FUNCTION public.vestara_accrue_interest(
  _user_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _interest_expense_id UUID;
  _accrued_id UUID;
BEGIN
  SELECT id INTO _interest_expense_id FROM vestara_accounts
    WHERE is_system = true AND account_type = 'interest_expense';

  _accrued_id := vestara_get_or_create_account(_user_id, 'accrued_interest', 'Accrued Interest');

  RETURN vestara_post_transaction(
    'interest_accrual', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _interest_expense_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _accrued_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata
  );
END;
$$;

-- PAYOUT INTEREST (accrued_interest → wallet)
CREATE OR REPLACE FUNCTION public.vestara_payout_interest(
  _user_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _accrued_id UUID;
  _wallet_id UUID;
BEGIN
  SELECT id INTO _accrued_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'accrued_interest' LIMIT 1;
  IF _accrued_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No accrued interest account');
  END IF;

  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;

  RETURN vestara_post_transaction(
    'interest_payout', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _accrued_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata
  );
END;
$$;

-- GET BALANCE (utility)
CREATE OR REPLACE FUNCTION public.vestara_get_balance(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result JSONB := '[]'::JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'account_id', id,
    'account_type', account_type,
    'balance', balance,
    'label', label
  )) INTO _result
  FROM vestara_accounts
  WHERE user_id = _user_id;

  RETURN COALESCE(_result, '[]'::JSONB);
END;
$$;

NOTIFY pgrst, 'reload schema';
