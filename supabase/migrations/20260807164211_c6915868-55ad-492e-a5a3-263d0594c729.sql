-- 1. Canonical cache recompute (idempotent, cannot drift)
CREATE OR REPLACE FUNCTION public.vestara_sync_user_balance_cache(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wallet numeric := 0;
  _locked numeric := 0;
  _savings numeric := 0;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('skipped', true); END IF;

  SELECT
    COALESCE(SUM(balance) FILTER (WHERE account_type = 'wallet'), 0),
    COALESCE(SUM(balance) FILTER (WHERE account_type = 'locked_savings'), 0),
    COALESCE(SUM(balance) FILTER (WHERE account_type = 'accrued_interest'), 0)
  INTO _wallet, _locked, _savings
  FROM vestara_accounts
  WHERE user_id = _user_id AND is_system = false;

  INSERT INTO vfd_user_balances (user_id, total_balance, available_balance, locked_balance, savings_balance, last_synced_at, updated_at)
  VALUES (_user_id, _wallet + _locked + _savings, _wallet, _locked, _savings, now(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    total_balance     = EXCLUDED.total_balance,
    available_balance = EXCLUDED.available_balance,
    locked_balance    = EXCLUDED.locked_balance,
    savings_balance   = EXCLUDED.savings_balance,
    last_synced_at    = now(),
    updated_at        = now();

  UPDATE public.wallets
     SET available_balance = _wallet, locked_balance = _locked, updated_at = now()
   WHERE user_id = _user_id;

  RETURN jsonb_build_object('wallet', _wallet, 'locked', _locked, 'savings', _savings);
END;
$function$;

-- 2. Fold the cache update into the ledger posting function itself.
CREATE OR REPLACE FUNCTION public.vestara_post_transaction(_type vestara_tx_type, _reference text, _amount numeric, _initiated_by uuid, _entries jsonb, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  _acct_owner UUID;
  _owners UUID[] := ARRAY[]::UUID[];
  _owner UUID;
BEGIN
  IF _entries IS NULL OR jsonb_array_length(_entries) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least 2 ledger entries required');
  END IF;

  FOR _entry IN SELECT * FROM jsonb_array_elements(_entries) LOOP
    _total_debit := _total_debit + COALESCE((_entry->>'debit')::NUMERIC, 0);
    _total_credit := _total_credit + COALESCE((_entry->>'credit')::NUMERIC, 0);
  END LOOP;

  IF _total_debit != _total_credit THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Debit/credit mismatch: debit=%s credit=%s', _total_debit, _total_credit));
  END IF;

  IF _total_debit <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction amount must be positive');
  END IF;

  INSERT INTO vestara_transactions (type, status, reference, amount, initiated_by, metadata, completed_at)
  VALUES (_type, 'completed', _reference, _amount, _initiated_by, _metadata, now())
  RETURNING id INTO _tx_id;

  FOR _entry IN SELECT * FROM jsonb_array_elements(_entries) LOOP
    _acct_id := (_entry->>'account_id')::UUID;
    _debit_amt := COALESCE((_entry->>'debit')::NUMERIC, 0);
    _credit_amt := COALESCE((_entry->>'credit')::NUMERIC, 0);

    SELECT balance, is_system, user_id INTO _current_balance, _is_sys, _acct_owner
    FROM vestara_accounts WHERE id = _acct_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account % not found', _acct_id;
    END IF;

    IF _debit_amt > 0 AND NOT _is_sys AND (_current_balance - _debit_amt) < 0 THEN
      RAISE EXCEPTION 'Insufficient balance in account %: has %, needs %', _acct_id, _current_balance, _debit_amt;
    END IF;

    INSERT INTO vestara_ledger_entries (transaction_id, account_id, debit, credit)
    VALUES (_tx_id, _acct_id, _debit_amt, _credit_amt);

    UPDATE vestara_accounts
    SET balance = balance - _debit_amt + _credit_amt
    WHERE id = _acct_id;

    IF _acct_owner IS NOT NULL AND NOT _is_sys AND NOT (_acct_owner = ANY(_owners)) THEN
      _owners := array_append(_owners, _acct_owner);
    END IF;
  END LOOP;

  -- STRUCTURAL GUARANTEE: the displayed balance cache is recomputed from the
  -- ledger-backed account balances inside the SAME transaction. It is not
  -- possible to write the ledger without the cache following it.
  FOREACH _owner IN ARRAY _owners LOOP
    PERFORM vestara_sync_user_balance_cache(_owner);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'transaction_id', _tx_id);
END;
$function$;

-- 3. Ledger-backed replacements for the cache-only credit paths.

-- 3a. SplitPay refund: split_holding -> wallet (falls back to settlement for
--     legacy splits whose payment leg predates ledger backing).
CREATE OR REPLACE FUNCTION public.vestara_split_refund(_user_id uuid, _split_id uuid, _amount numeric, _reference text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wallet_id UUID;
  _source_id UUID;
  _source_bal NUMERIC := 0;
  _legacy BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _reference) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' AND is_system = false LIMIT 1;
  IF _wallet_id IS NULL THEN
    _wallet_id := vestara_get_or_create_account(_user_id, 'wallet', 'User Wallet');
  END IF;

  SELECT id, balance INTO _source_id, _source_bal FROM vestara_accounts
    WHERE account_type = 'split_holding' AND split_ref = _split_id LIMIT 1;

  IF _source_id IS NULL OR _source_bal < _amount THEN
    SELECT id INTO _source_id FROM vestara_accounts WHERE is_system = true AND account_type = 'settlement';
    _legacy := true;
  END IF;

  RETURN vestara_post_transaction(
    'reversal', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _source_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('source', 'split_refund', 'split_id', _split_id, 'legacy_source', _legacy)
  );
END;
$function$;

-- 3b. Crowdfunding contribution: wallet -> campaign pool
CREATE OR REPLACE FUNCTION public.vestara_campaign_contribute(_user_id uuid, _campaign_id uuid, _amount numeric, _reference text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wallet_id UUID;
  _pool_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _reference) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' AND is_system = false LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  SELECT id INTO _pool_id FROM vestara_accounts
    WHERE account_type = 'crowdfunding_pool' AND campaign_ref = _campaign_id LIMIT 1;
  IF _pool_id IS NULL THEN
    INSERT INTO vestara_accounts (user_id, account_type, campaign_ref, label)
    VALUES (NULL, 'crowdfunding_pool', _campaign_id, 'Campaign Pool')
    RETURNING id INTO _pool_id;
  END IF;

  RETURN vestara_post_transaction(
    'crowdfunding_contribution', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _pool_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('source', 'campaign_contribution', 'campaign_id', _campaign_id)
  );
END;
$function$;

-- 3c. Crowdfunding escrow withdrawal: campaign pool -> owner wallet
CREATE OR REPLACE FUNCTION public.vestara_campaign_withdraw(_user_id uuid, _campaign_id uuid, _amount numeric, _reference text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wallet_id UUID;
  _pool_id UUID;
  _pool_bal NUMERIC := 0;
  _legacy BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _reference) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' AND is_system = false LIMIT 1;
  IF _wallet_id IS NULL THEN
    _wallet_id := vestara_get_or_create_account(_user_id, 'wallet', 'User Wallet');
  END IF;

  SELECT id, balance INTO _pool_id, _pool_bal FROM vestara_accounts
    WHERE account_type = 'crowdfunding_pool' AND campaign_ref = _campaign_id LIMIT 1;

  IF _pool_id IS NULL OR _pool_bal < _amount THEN
    SELECT id INTO _pool_id FROM vestara_accounts WHERE is_system = true AND account_type = 'settlement';
    _legacy := true;
  END IF;

  RETURN vestara_post_transaction(
    'crowdfunding_disbursement', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _pool_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('source', 'campaign_escrow_withdrawal', 'campaign_id', _campaign_id, 'legacy_source', _legacy)
  );
END;
$function$;

-- 3d. Target Ajo payout: thrift pool -> member wallet
CREATE OR REPLACE FUNCTION public.vestara_target_payout(_user_id uuid, _group_id uuid, _amount numeric, _reference text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wallet_id UUID;
  _pool_id UUID;
  _pool_bal NUMERIC := 0;
  _legacy BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _reference) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' AND is_system = false LIMIT 1;
  IF _wallet_id IS NULL THEN
    _wallet_id := vestara_get_or_create_account(_user_id, 'wallet', 'User Wallet');
  END IF;

  SELECT id, balance INTO _pool_id, _pool_bal FROM vestara_accounts
    WHERE account_type = 'thrift_pool' AND group_ref = _group_id LIMIT 1;

  IF _pool_id IS NULL OR _pool_bal < _amount THEN
    SELECT id INTO _pool_id FROM vestara_accounts WHERE is_system = true AND account_type = 'settlement';
    _legacy := true;
  END IF;

  RETURN vestara_post_transaction(
    'thrift_payout', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _pool_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('source', 'target_ajo_payout', 'group_id', _group_id, 'legacy_source', _legacy)
  );
END;
$function$;

-- 4. Drift findings store
CREATE TABLE IF NOT EXISTS public.ledger_drift_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  account_id uuid,
  user_id uuid,
  account_type text,
  expected numeric(18,2) NOT NULL DEFAULT 0,
  actual numeric(18,2) NOT NULL DEFAULT 0,
  delta numeric(18,2) NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ledger_drift_findings TO authenticated;
GRANT ALL ON public.ledger_drift_findings TO service_role;

ALTER TABLE public.ledger_drift_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ledger drift findings"
ON public.ledger_drift_findings FOR SELECT
TO authenticated
USING (public.is_any_admin());

CREATE TRIGGER trg_ledger_drift_findings_updated
BEFORE UPDATE ON public.ledger_drift_findings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_ledger_drift_open
  ON public.ledger_drift_findings (detected_at DESC) WHERE resolved_at IS NULL;

-- 5. Drift detection: account balance vs ledger history, and wallet vs cache
CREATE OR REPLACE FUNCTION public.vestara_detect_balance_drift()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _found INT := 0;
  _rec RECORD;
BEGIN
  -- Close previously open findings; anything still broken is re-raised below.
  UPDATE ledger_drift_findings SET resolved_at = now() WHERE resolved_at IS NULL;

  -- (a) account balance vs sum of its ledger entries
  FOR _rec IN
    SELECT a.id, a.user_id, a.account_type::text AS atype, a.balance,
           COALESCE(SUM(l.credit - l.debit), 0) AS ledger_sum
    FROM vestara_accounts a
    LEFT JOIN vestara_ledger_entries l ON l.account_id = a.id
    GROUP BY a.id
    HAVING ABS(a.balance - COALESCE(SUM(l.credit - l.debit), 0)) > 0.005
  LOOP
    INSERT INTO ledger_drift_findings (kind, account_id, user_id, account_type, expected, actual, delta, details)
    VALUES ('account_vs_ledger', _rec.id, _rec.user_id, _rec.atype,
            _rec.ledger_sum, _rec.balance, _rec.balance - _rec.ledger_sum,
            jsonb_build_object('description', 'Account balance does not match its ledger history'));
    _found := _found + 1;
  END LOOP;

  -- (b) wallet balance vs displayed balance cache
  FOR _rec IN
    SELECT a.user_id, a.id, a.balance,
           COALESCE(b.total_balance, 0) AS cached
    FROM vestara_accounts a
    LEFT JOIN vfd_user_balances b ON b.user_id = a.user_id
    WHERE a.account_type = 'wallet' AND a.is_system = false
      AND ABS(COALESCE(b.total_balance, 0) - a.balance
              - COALESCE(b.locked_balance, 0) - COALESCE(b.savings_balance, 0)) > 0.005
  LOOP
    INSERT INTO ledger_drift_findings (kind, account_id, user_id, account_type, expected, actual, delta, details)
    VALUES ('wallet_vs_cache', _rec.id, _rec.user_id, 'wallet',
            _rec.balance, _rec.cached, _rec.cached - _rec.balance,
            jsonb_build_object('description', 'Displayed balance does not match ledger wallet balance'));
    _found := _found + 1;
  END LOOP;

  RETURN jsonb_build_object('checked_at', now(), 'findings', _found);
END;
$function$;