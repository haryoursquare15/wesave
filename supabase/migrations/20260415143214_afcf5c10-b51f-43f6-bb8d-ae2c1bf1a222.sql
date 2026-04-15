
-- 1. Add metadata column to vestara_accounts
ALTER TABLE public.vestara_accounts
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Add pending_transfer account type
ALTER TYPE public.vestara_account_type ADD VALUE IF NOT EXISTS 'pending_transfer';

-- 3. Add transfer and reversal tx types
ALTER TYPE public.vestara_tx_type ADD VALUE IF NOT EXISTS 'transfer';
ALTER TYPE public.vestara_tx_type ADD VALUE IF NOT EXISTS 'reversal';

-- 4. Add ip_address to vestara_transactions for audit
ALTER TABLE public.vestara_transactions
ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- 5. Update vestara_lock_funds to store metadata (interest_rate, maturity_date, penalty_rate)
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
  _interest_rate NUMERIC;
  _penalty_rate NUMERIC;
  _maturity_date TIMESTAMPTZ;
  _result JSONB;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  -- Determine rates (from metadata or defaults)
  _interest_rate := COALESCE((_metadata->>'interest_rate')::NUMERIC, 10);
  _penalty_rate := COALESCE((_metadata->>'penalty_rate')::NUMERIC, 5);
  _maturity_date := now() + (_duration_months || ' months')::INTERVAL;

  -- Create a new locked_savings account for THIS specific lock
  INSERT INTO vestara_accounts (user_id, account_type, label, metadata)
  VALUES (
    _user_id,
    'locked_savings',
    format('Locked Savings (%s months)', _duration_months),
    jsonb_build_object(
      'interest_rate', _interest_rate,
      'penalty_rate', _penalty_rate,
      'duration_months', _duration_months,
      'maturity_date', _maturity_date,
      'locked_at', now()
    )
  )
  RETURNING id INTO _lock_id;

  _result := vestara_post_transaction(
    'lock', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _lock_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object(
      'duration_months', _duration_months,
      'interest_rate', _interest_rate,
      'penalty_rate', _penalty_rate,
      'maturity_date', _maturity_date,
      'lock_account_id', _lock_id
    )
  );

  RETURN _result || jsonb_build_object('lock_account_id', _lock_id);
END;
$$;

-- 6. Update vestara_unlock_funds to read penalty from metadata
CREATE OR REPLACE FUNCTION public.vestara_unlock_funds(
  _user_id UUID,
  _lock_account_id UUID,
  _penalty NUMERIC DEFAULT NULL,
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
  _lock_meta JSONB;
  _actual_penalty NUMERIC;
  _net_amount NUMERIC;
  _entries JSONB;
  _ref TEXT;
  _is_early BOOLEAN;
  _maturity_date TIMESTAMPTZ;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;

  SELECT balance, metadata INTO _lock_balance, _lock_meta FROM vestara_accounts
    WHERE id = _lock_account_id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lock account not found');
  END IF;

  IF _lock_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lock account has zero balance');
  END IF;

  -- Determine if early withdrawal
  _maturity_date := (_lock_meta->>'maturity_date')::TIMESTAMPTZ;
  _is_early := (_maturity_date IS NOT NULL AND now() < _maturity_date);

  -- Calculate penalty: use explicit param if provided, else auto-calculate from metadata
  IF _penalty IS NOT NULL THEN
    _actual_penalty := _penalty;
  ELSIF _is_early THEN
    _actual_penalty := ROUND(_lock_balance * COALESCE((_lock_meta->>'penalty_rate')::NUMERIC, 5) / 100, 2);
  ELSE
    _actual_penalty := 0;
  END IF;

  _net_amount := _lock_balance - _actual_penalty;
  _ref := COALESCE(_reference, 'unlock-' || gen_random_uuid()::TEXT);

  _entries := jsonb_build_array(
    jsonb_build_object('account_id', _lock_account_id, 'debit', _lock_balance, 'credit', 0),
    jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _net_amount)
  );

  IF _actual_penalty > 0 THEN
    SELECT id INTO _revenue_id FROM vestara_accounts
      WHERE is_system = true AND account_type = 'revenue';
    _entries := _entries || jsonb_build_array(
      jsonb_build_object('account_id', _revenue_id, 'debit', 0, 'credit', _actual_penalty)
    );
  END IF;

  RETURN vestara_post_transaction(
    'unlock', _ref, _lock_balance, _user_id, _entries,
    _metadata || jsonb_build_object(
      'penalty', _actual_penalty,
      'is_early_withdrawal', _is_early,
      'maturity_date', _maturity_date,
      'lock_account_id', _lock_account_id
    )
  );
END;
$$;

-- 7. Create vestara_transfer with pending pattern
CREATE OR REPLACE FUNCTION public.vestara_transfer_initiate(
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
  _holding_id UUID;
  _result JSONB;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  -- Create or get pending_transfer holding account for this user
  SELECT id INTO _holding_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'pending_transfer' LIMIT 1;
  IF _holding_id IS NULL THEN
    INSERT INTO vestara_accounts (user_id, account_type, label, metadata)
    VALUES (_user_id, 'pending_transfer', 'Pending Transfers', '{}'::jsonb)
    RETURNING id INTO _holding_id;
  END IF;

  -- Move funds from wallet to holding (pending state)
  _result := vestara_post_transaction(
    'transfer', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _holding_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('transfer_status', 'pending', 'holding_account_id', _holding_id)
  );

  RETURN _result || jsonb_build_object('holding_account_id', _holding_id);
END;
$$;

-- 8. Complete or fail a pending transfer
CREATE OR REPLACE FUNCTION public.vestara_transfer_complete(
  _user_id UUID,
  _original_reference TEXT,
  _success BOOLEAN,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _holding_id UUID;
  _wallet_id UUID;
  _settlement_id UUID;
  _holding_balance NUMERIC;
  _original_tx RECORD;
  _original_amount NUMERIC;
BEGIN
  -- Find the original pending transaction
  SELECT id, amount, metadata INTO _original_tx FROM vestara_transactions
    WHERE reference = _original_reference AND type = 'transfer' LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original transfer not found');
  END IF;

  _original_amount := _original_tx.amount;

  SELECT id INTO _holding_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'pending_transfer' LIMIT 1;
  IF _holding_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending transfer account');
  END IF;

  SELECT balance INTO _holding_balance FROM vestara_accounts
    WHERE id = _holding_id FOR UPDATE;

  IF _holding_balance < _original_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient holding balance');
  END IF;

  IF _success THEN
    -- Transfer succeeded: move from holding to settlement (money left the platform)
    SELECT id INTO _settlement_id FROM vestara_accounts
      WHERE is_system = true AND account_type = 'settlement';

    RETURN vestara_post_transaction(
      'withdrawal', _original_reference || '-complete', _original_amount, _user_id,
      jsonb_build_array(
        jsonb_build_object('account_id', _holding_id, 'debit', _original_amount, 'credit', 0),
        jsonb_build_object('account_id', _settlement_id, 'debit', 0, 'credit', _original_amount)
      ),
      _metadata || jsonb_build_object('transfer_status', 'completed', 'original_reference', _original_reference)
    );
  ELSE
    -- Transfer failed: refund from holding back to wallet
    SELECT id INTO _wallet_id FROM vestara_accounts
      WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;

    RETURN vestara_post_transaction(
      'reversal', _original_reference || '-refund', _original_amount, _user_id,
      jsonb_build_array(
        jsonb_build_object('account_id', _holding_id, 'debit', _original_amount, 'credit', 0),
        jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _original_amount)
      ),
      _metadata || jsonb_build_object('transfer_status', 'failed', 'original_reference', _original_reference)
    );
  END IF;
END;
$$;

-- 9. Create vestara_reverse_transaction for voiding
CREATE OR REPLACE FUNCTION public.vestara_reverse_transaction(
  _original_reference TEXT,
  _reason TEXT,
  _initiated_by UUID DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _original_tx RECORD;
  _entry RECORD;
  _reversal_entries JSONB := '[]'::JSONB;
BEGIN
  SELECT id, amount, type, status INTO _original_tx FROM vestara_transactions
    WHERE reference = _original_reference LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original transaction not found');
  END IF;

  IF _original_tx.status != 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only reverse completed transactions');
  END IF;

  -- Reverse every ledger entry (swap debits and credits)
  FOR _entry IN SELECT account_id, debit, credit FROM vestara_ledger_entries
    WHERE transaction_id = _original_tx.id
  LOOP
    _reversal_entries := _reversal_entries || jsonb_build_array(
      jsonb_build_object('account_id', _entry.account_id, 'debit', _entry.credit, 'credit', _entry.debit)
    );
  END LOOP;

  RETURN vestara_post_transaction(
    'reversal',
    'rev-' || _original_reference,
    _original_tx.amount,
    _initiated_by,
    _reversal_entries,
    _metadata || jsonb_build_object('reason', _reason, 'original_reference', _original_reference, 'original_transaction_id', _original_tx.id)
  );
END;
$$;

-- 10. Improved per-account reconciliation view
CREATE OR REPLACE VIEW public.vestara_account_drift AS
SELECT
  va.id,
  va.account_type,
  va.user_id,
  va.balance AS stored_balance,
  COALESCE(SUM(vle.credit), 0) - COALESCE(SUM(vle.debit), 0) AS derived_balance,
  va.balance - (COALESCE(SUM(vle.credit), 0) - COALESCE(SUM(vle.debit), 0)) AS drift,
  va.is_system
FROM vestara_accounts va
LEFT JOIN vestara_ledger_entries vle ON vle.account_id = va.id
GROUP BY va.id, va.account_type, va.user_id, va.balance, va.is_system;
