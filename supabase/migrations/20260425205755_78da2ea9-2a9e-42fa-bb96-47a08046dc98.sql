CREATE OR REPLACE FUNCTION public.vestara_accrue_daily_interest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_total_user numeric := 0;
  v_total_vfd  numeric := 0;
  r record;
  v_user_int numeric;
  v_vfd_int  numeric;
BEGIN
  FOR r IN
    SELECT id, principal, user_rate, vfd_rate, product_code
      FROM public.vestara_savings
     WHERE status = 'active' AND product_code <> 'upfront_yield'
       AND maturity_date > now()
  LOOP
    v_user_int := ROUND(r.principal * (r.user_rate / 100.0) / 365.0, 2);
    v_vfd_int  := ROUND(r.principal * (r.vfd_rate  / 100.0) / 365.0, 2);
    UPDATE public.vestara_savings
       SET accrued_interest = accrued_interest + v_user_int
     WHERE id = r.id;
    v_total_user := v_total_user + v_user_int;
    v_total_vfd  := v_total_vfd  + v_vfd_int;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.vestara_treasury
     SET total_interest_paid     = total_interest_paid + v_total_user,
         total_interest_from_vfd = total_interest_from_vfd + v_total_vfd,
         interest_spread_profit  = interest_spread_profit + (v_total_vfd - v_total_user),
         updated_at = now()
   WHERE id IS NOT NULL;

  RETURN jsonb_build_object(
    'success', true,
    'accrued_count', v_count,
    'user_interest', v_total_user,
    'vfd_interest', v_total_vfd,
    'spread', v_total_vfd - v_total_user
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.vestara_create_savings(
  _user_id uuid,
  _product_code public.vestara_product_code,
  _principal numeric,
  _tenor_days integer,
  _reference text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.vestara_products%ROWTYPE;
  v_wallet_id uuid;
  v_wallet_balance numeric;
  v_locked_total numeric;
  v_available numeric;
  v_lock_account_id uuid;
  v_tx_id uuid;
  v_user_rate numeric;
  v_time_frac numeric;
  v_discounted_interest numeric := 0;
  v_effective_rate numeric;
  v_maturity timestamptz;
  v_savings_id uuid;
BEGIN
  SELECT * INTO v_product FROM public.vestara_products
   WHERE code = _product_code AND is_active = true FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not available', _product_code USING ERRCODE = 'P0001';
  END IF;
  IF _principal <= 0 THEN
    RAISE EXCEPTION 'Principal must be positive' USING ERRCODE = 'P0001';
  END IF;
  IF _tenor_days < v_product.min_tenor_days OR _tenor_days > v_product.max_tenor_days THEN
    RAISE EXCEPTION 'Tenor % outside allowed range (% – % days)',
      _tenor_days, v_product.min_tenor_days, v_product.max_tenor_days
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, balance INTO v_wallet_id, v_wallet_balance
    FROM public.vestara_accounts
   WHERE user_id = _user_id AND account_type = 'wallet' AND is_system = false
   FOR UPDATE;
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not provisioned for user' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(balance),0) INTO v_locked_total
    FROM public.vestara_accounts
   WHERE user_id = _user_id AND account_type = 'locked_savings';

  v_available := v_wallet_balance - v_locked_total;
  IF _principal > v_available THEN
    RAISE EXCEPTION 'Insufficient available balance (available=%, requested=%)',
      v_available, _principal USING ERRCODE = 'P0001';
  END IF;

  v_user_rate := v_product.min_user_rate +
    ( (v_product.max_user_rate - v_product.min_user_rate)
      * GREATEST(0, LEAST(1,
          (_tenor_days - v_product.min_tenor_days)::numeric
          / NULLIF(v_product.max_tenor_days - v_product.min_tenor_days, 0)
        ))
    );

  v_time_frac := _tenor_days::numeric / 365.0;
  v_maturity  := now() + (_tenor_days || ' days')::interval;

  IF v_product.is_upfront_yield THEN
    v_discounted_interest :=
      ROUND( (_principal * (v_user_rate/100.0) * v_time_frac)
             / (1 + (v_user_rate/100.0) * v_time_frac), 2);
    v_effective_rate := ROUND(v_user_rate, 4);
  END IF;

  INSERT INTO public.vestara_accounts
    (user_id, account_type, balance, currency, label, metadata)
  VALUES
    (_user_id, 'locked_savings', 0, 'NGN',
     v_product.name || ' lock',
     jsonb_build_object(
       'product_code', v_product.code,
       'tenor_days', _tenor_days,
       'user_rate', v_user_rate,
       'vfd_rate', v_product.vfd_rate,
       'maturity_date', v_maturity
     ))
  RETURNING id INTO v_lock_account_id;

  INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
  VALUES ('lock','completed', _reference, _principal, _user_id,
          jsonb_build_object('product', v_product.code, 'tenor_days', _tenor_days))
  RETURNING id INTO v_tx_id;

  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES (v_tx_id, v_wallet_id, _principal, 0),
         (v_tx_id, v_lock_account_id, 0, _principal);

  UPDATE public.vestara_accounts SET balance = balance - _principal WHERE id = v_wallet_id;
  UPDATE public.vestara_accounts SET balance = balance + _principal WHERE id = v_lock_account_id;

  IF v_product.is_upfront_yield AND v_discounted_interest > 0 THEN
    DECLARE v_int_tx uuid; v_sys_int_acct uuid;
    BEGIN
      SELECT id INTO v_sys_int_acct FROM public.vestara_accounts
        WHERE is_system = true AND account_type = 'accrued_interest' LIMIT 1;
      IF v_sys_int_acct IS NULL THEN
        INSERT INTO public.vestara_accounts (account_type, balance, is_system, label)
        VALUES ('accrued_interest', 0, true, 'Accrued interest pool')
        RETURNING id INTO v_sys_int_acct;
      END IF;

      INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
      VALUES ('interest','completed', _reference || '-upfront', v_discounted_interest, _user_id,
              jsonb_build_object('kind','upfront_yield','savings_ref',_reference))
      RETURNING id INTO v_int_tx;

      INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
      VALUES (v_int_tx, v_sys_int_acct, v_discounted_interest, 0),
             (v_int_tx, v_wallet_id, 0, v_discounted_interest);

      UPDATE public.vestara_accounts SET balance = balance - v_discounted_interest WHERE id = v_sys_int_acct;
      UPDATE public.vestara_accounts SET balance = balance + v_discounted_interest WHERE id = v_wallet_id;
    END;
  END IF;

  INSERT INTO public.vestara_savings
    (user_id, product_id, product_code, lock_account_id,
     principal, original_principal, user_rate, vfd_rate, tenor_days,
     start_date, maturity_date, discounted_interest_paid, effective_rate)
  VALUES
    (_user_id, v_product.id, v_product.code, v_lock_account_id,
     _principal, _principal, v_user_rate, v_product.vfd_rate, _tenor_days,
     now(), v_maturity, v_discounted_interest, v_effective_rate)
  RETURNING id INTO v_savings_id;

  UPDATE public.vestara_treasury
     SET total_locked_funds       = total_locked_funds + _principal,
         total_invested_with_vfd  = (total_locked_funds + _principal) * invest_ratio,
         liquidity_buffer         = (total_locked_funds + _principal) * (1 - invest_ratio),
         updated_at                = now()
   WHERE id IS NOT NULL;

  RETURN jsonb_build_object(
    'success', true,
    'savings_id', v_savings_id,
    'lock_account_id', v_lock_account_id,
    'user_rate', v_user_rate,
    'maturity_date', v_maturity,
    'discounted_interest_paid', v_discounted_interest
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.vestara_mature_savings(_savings_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.vestara_savings%ROWTYPE;
  v_wallet_id uuid;
  v_tx_id uuid;
  v_total_payout numeric;
  v_interest_due numeric;
  v_sys_int_acct uuid;
BEGIN
  SELECT * INTO v_s FROM public.vestara_savings WHERE id = _savings_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings not found'; END IF;
  IF v_s.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Savings already ' || v_s.status);
  END IF;

  SELECT id INTO v_wallet_id FROM public.vestara_accounts
    WHERE user_id = v_s.user_id AND account_type = 'wallet' AND is_system = false FOR UPDATE;

  IF v_s.product_code = 'upfront_yield' THEN
    v_interest_due := 0;
  ELSE
    v_interest_due := v_s.accrued_interest;
  END IF;
  v_total_payout := v_s.principal + v_interest_due;

  INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
  VALUES ('unlock','completed', 'mature-' || v_s.id, v_total_payout, v_s.user_id,
          jsonb_build_object('kind','maturity','savings_id', v_s.id))
  RETURNING id INTO v_tx_id;

  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES (v_tx_id, v_s.lock_account_id, v_s.principal, 0),
         (v_tx_id, v_wallet_id, 0, v_s.principal);
  UPDATE public.vestara_accounts SET balance = balance - v_s.principal WHERE id = v_s.lock_account_id;
  UPDATE public.vestara_accounts SET balance = balance + v_s.principal WHERE id = v_wallet_id;

  IF v_interest_due > 0 THEN
    SELECT id INTO v_sys_int_acct FROM public.vestara_accounts
      WHERE is_system = true AND account_type = 'accrued_interest' LIMIT 1;
    IF v_sys_int_acct IS NULL THEN
      INSERT INTO public.vestara_accounts (account_type, balance, is_system, label)
      VALUES ('accrued_interest', 0, true, 'Accrued interest pool')
      RETURNING id INTO v_sys_int_acct;
    END IF;
    DECLARE v_int_tx uuid;
    BEGIN
      INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
      VALUES ('interest','completed', 'mature-int-' || v_s.id, v_interest_due, v_s.user_id,
              jsonb_build_object('savings_id', v_s.id))
      RETURNING id INTO v_int_tx;
      INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
      VALUES (v_int_tx, v_sys_int_acct, v_interest_due, 0),
             (v_int_tx, v_wallet_id, 0, v_interest_due);
      UPDATE public.vestara_accounts SET balance = balance - v_interest_due WHERE id = v_sys_int_acct;
      UPDATE public.vestara_accounts SET balance = balance + v_interest_due WHERE id = v_wallet_id;
    END;
  END IF;

  UPDATE public.vestara_savings
     SET status = 'matured', matured_at = now(), principal = 0
   WHERE id = _savings_id;

  UPDATE public.vestara_treasury
     SET total_locked_funds       = GREATEST(0, total_locked_funds - v_s.principal),
         total_invested_with_vfd  = GREATEST(0, total_locked_funds - v_s.principal) * invest_ratio,
         liquidity_buffer         = GREATEST(0, total_locked_funds - v_s.principal) * (1 - invest_ratio),
         updated_at                = now()
   WHERE id IS NOT NULL;

  RETURN jsonb_build_object('success', true, 'savings_id', v_s.id, 'payout', v_total_payout);
END;
$$;

CREATE OR REPLACE FUNCTION public.vestara_early_withdraw_savings(
  _user_id uuid,
  _savings_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.vestara_savings%ROWTYPE;
  v_p public.vestara_products%ROWTYPE;
  v_wallet_id uuid;
  v_sys_int_acct uuid;
  v_tx_id uuid;
  v_penalty numeric;
  v_net_interest numeric;
  v_payout numeric;
BEGIN
  SELECT * INTO v_s FROM public.vestara_savings WHERE id = _savings_id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings not found'; END IF;
  IF v_s.status <> 'active' THEN
    RAISE EXCEPTION 'Savings is %', v_s.status USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_p FROM public.vestara_products WHERE id = v_s.product_id;
  IF NOT v_p.allow_early_withdrawal THEN
    RAISE EXCEPTION 'Early withdrawal not allowed for %', v_p.name USING ERRCODE = 'P0001';
  END IF;

  v_penalty := ROUND(v_s.accrued_interest * (v_p.early_withdrawal_penalty_pct / 100.0), 2);
  v_net_interest := GREATEST(0, v_s.accrued_interest - v_penalty);
  v_payout := v_s.principal + v_net_interest;

  SELECT id INTO v_wallet_id FROM public.vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' AND is_system = false FOR UPDATE;

  INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
  VALUES ('unlock','completed', 'ewd-' || v_s.id, v_payout, _user_id,
          jsonb_build_object('kind','early_withdrawal','penalty', v_penalty))
  RETURNING id INTO v_tx_id;

  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES (v_tx_id, v_s.lock_account_id, v_s.principal, 0),
         (v_tx_id, v_wallet_id, 0, v_s.principal);
  UPDATE public.vestara_accounts SET balance = balance - v_s.principal WHERE id = v_s.lock_account_id;
  UPDATE public.vestara_accounts SET balance = balance + v_s.principal WHERE id = v_wallet_id;

  IF v_net_interest > 0 THEN
    SELECT id INTO v_sys_int_acct FROM public.vestara_accounts
      WHERE is_system = true AND account_type = 'accrued_interest' LIMIT 1;
    IF v_sys_int_acct IS NOT NULL THEN
      DECLARE v_int_tx uuid;
      BEGIN
        INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
        VALUES ('interest','completed', 'ewd-int-' || v_s.id, v_net_interest, _user_id, '{}')
        RETURNING id INTO v_int_tx;
        INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
        VALUES (v_int_tx, v_sys_int_acct, v_net_interest, 0),
               (v_int_tx, v_wallet_id, 0, v_net_interest);
        UPDATE public.vestara_accounts SET balance = balance - v_net_interest WHERE id = v_sys_int_acct;
        UPDATE public.vestara_accounts SET balance = balance + v_net_interest WHERE id = v_wallet_id;
      END;
    END IF;
  END IF;

  UPDATE public.vestara_savings
     SET status = 'early_withdrawn', withdrawn_at = now(),
         penalty_amount = v_penalty, principal = 0
   WHERE id = _savings_id;

  UPDATE public.vestara_treasury
     SET total_locked_funds       = GREATEST(0, total_locked_funds - v_s.principal),
         total_invested_with_vfd  = GREATEST(0, total_locked_funds - v_s.principal) * invest_ratio,
         liquidity_buffer         = GREATEST(0, total_locked_funds - v_s.principal) * (1 - invest_ratio),
         interest_spread_profit   = interest_spread_profit + v_penalty,
         updated_at                = now()
   WHERE id IS NOT NULL;

  RETURN jsonb_build_object('success', true, 'payout', v_payout, 'penalty', v_penalty);
END;
$$;