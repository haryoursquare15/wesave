CREATE OR REPLACE FUNCTION public.vestara_create_savings(_user_id uuid, _product_code vestara_product_code, _principal numeric, _tenor_days integer, _reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product RECORD;
  v_wallet RECORD;
  v_lock_account RECORD;
  v_savings_id UUID;
  v_user_rate NUMERIC;
  v_vfd_rate NUMERIC;
  v_rate_source TEXT;
  v_time_frac NUMERIC;
  v_discounted_interest NUMERIC := 0;
  v_effective_rate NUMERIC := NULL;
  v_maturity_date TIMESTAMPTZ;
  v_tx_id UUID;
  v_reference TEXT;
BEGIN
  IF _principal <= 0 THEN
    RAISE EXCEPTION 'Principal must be positive';
  END IF;

  SELECT * INTO v_product
  FROM public.vestara_products
  WHERE code = _product_code AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found or inactive', _product_code;
  END IF;

  IF _tenor_days < v_product.min_tenor_days OR _tenor_days > v_product.max_tenor_days THEN
    RAISE EXCEPTION 'Tenor % outside allowed range %-% for product %',
      _tenor_days, v_product.min_tenor_days, v_product.max_tenor_days, _product_code;
  END IF;

  SELECT r.user_rate, r.vfd_rate, r.source
    INTO v_user_rate, v_vfd_rate, v_rate_source
  FROM public.vestara_resolve_rate(_product_code, _tenor_days, _principal) r;

  -- Rate validation: enforce positive spread (vfd_rate > user_rate)
  IF v_user_rate IS NULL OR v_vfd_rate IS NULL OR v_vfd_rate <= v_user_rate THEN
    RAISE EXCEPTION 'Invalid rate configuration'
      USING HINT = format('product=%s tenor=%s user_rate=%s vfd_rate=%s', _product_code, _tenor_days, v_user_rate, v_vfd_rate);
  END IF;

  SELECT * INTO v_wallet
  FROM public.vestara_accounts
  WHERE user_id = _user_id AND account_type = 'wallet'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_wallet.balance < _principal THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  v_time_frac := _tenor_days::NUMERIC / 365.0;
  v_maturity_date := now() + (_tenor_days || ' days')::INTERVAL;
  v_reference := COALESCE(_reference, 'vestara-savings-' || gen_random_uuid()::text);

  INSERT INTO public.vestara_accounts (user_id, account_type, balance, currency, metadata)
  VALUES (_user_id, 'locked_savings', 0, 'NGN', jsonb_build_object(
    'product_code', _product_code,
    'tenor_days', _tenor_days,
    'user_rate', v_user_rate,
    'vfd_rate', v_vfd_rate,
    'rate_source', v_rate_source,
    'created_for', 'vestara_savings'
  ))
  RETURNING * INTO v_lock_account;

  INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
  VALUES ('savings_create', 'completed', v_reference, _principal, _user_id, jsonb_build_object(
    'product_code', _product_code,
    'tenor_days', _tenor_days,
    'user_rate', v_user_rate,
    'vfd_rate', v_vfd_rate,
    'rate_source', v_rate_source
  ))
  RETURNING id INTO v_tx_id;

  -- Move principal: debit wallet, credit lock account
  UPDATE public.vestara_accounts SET balance = balance - _principal, updated_at = now() WHERE id = v_wallet.id;
  UPDATE public.vestara_accounts SET balance = balance + _principal, updated_at = now() WHERE id = v_lock_account.id;

  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES
    (v_tx_id, v_wallet.id, _principal, 0),
    (v_tx_id, v_lock_account.id, 0, _principal);

  -- Upfront yield: pay discounted interest immediately back to wallet
  IF v_product.is_upfront_yield THEN
    v_discounted_interest := ROUND(
      (_principal * (v_user_rate/100.0) * v_time_frac) / (1 + (v_user_rate/100.0) * v_time_frac),
      2
    );
    v_effective_rate := CASE WHEN _principal > 0
      THEN ROUND((v_discounted_interest / _principal) * (365.0 / _tenor_days) * 100, 4)
      ELSE NULL END;

    IF v_discounted_interest > 0 THEN
      UPDATE public.vestara_accounts SET balance = balance + v_discounted_interest, updated_at = now() WHERE id = v_wallet.id;

      INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
      VALUES (v_tx_id, v_wallet.id, 0, v_discounted_interest);
    END IF;
  END IF;

  INSERT INTO public.vestara_savings (
    user_id, product_id, product_code, lock_account_id,
    principal, original_principal, user_rate, vfd_rate, tenor_days,
    start_date, maturity_date, accrued_interest, discounted_interest_paid,
    effective_rate, status, metadata
  ) VALUES (
    _user_id, v_product.id, _product_code, v_lock_account.id,
    _principal, _principal, v_user_rate, v_vfd_rate, _tenor_days,
    now(), v_maturity_date, 0, v_discounted_interest,
    v_effective_rate, 'active',
    jsonb_build_object('rate_source', v_rate_source, 'transaction_id', v_tx_id)
  )
  RETURNING id INTO v_savings_id;

  RETURN jsonb_build_object(
    'savings_id', v_savings_id,
    'product_code', _product_code,
    'principal', _principal,
    'user_rate', v_user_rate,
    'vfd_rate', v_vfd_rate,
    'spread', v_vfd_rate - v_user_rate,
    'rate_source', v_rate_source,
    'tenor_days', _tenor_days,
    'maturity_date', v_maturity_date,
    'discounted_interest_paid', v_discounted_interest,
    'effective_rate', v_effective_rate,
    'transaction_id', v_tx_id,
    'reference', v_reference
  );
END;
$function$;