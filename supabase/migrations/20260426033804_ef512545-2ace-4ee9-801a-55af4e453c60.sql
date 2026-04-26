
-- ============================================================
-- VESTARA RATE CONFIGURATION ENGINE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vestara_rate_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code public.vestara_product_code NOT NULL,
  min_tenor_days INTEGER NOT NULL,
  max_tenor_days INTEGER NOT NULL,
  min_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(20,2),
  user_rate NUMERIC(6,3) NOT NULL,
  vfd_rate NUMERIC(6,3) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vestara_rate_configs_tenor_chk CHECK (max_tenor_days >= min_tenor_days),
  CONSTRAINT vestara_rate_configs_amount_chk CHECK (max_amount IS NULL OR max_amount >= min_amount),
  CONSTRAINT vestara_rate_configs_rate_chk CHECK (user_rate >= 0 AND vfd_rate >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vestara_rate_configs_lookup
  ON public.vestara_rate_configs (product_code, is_active, priority DESC);

ALTER TABLE public.vestara_rate_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active rate tiers"
  ON public.vestara_rate_configs
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert rate tiers"
  ON public.vestara_rate_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update rate tiers"
  ON public.vestara_rate_configs
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete rate tiers"
  ON public.vestara_rate_configs
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_vestara_rate_configs_updated_at
  BEFORE UPDATE ON public.vestara_rate_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RATE LOOKUP FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.vestara_resolve_rate(
  _product_code public.vestara_product_code,
  _tenor_days INTEGER,
  _amount NUMERIC
)
RETURNS TABLE(user_rate NUMERIC, vfd_rate NUMERIC, source TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier RECORD;
  v_product RECORD;
  v_user_rate NUMERIC;
BEGIN
  SELECT rc.user_rate, rc.vfd_rate
    INTO v_tier
  FROM public.vestara_rate_configs rc
  WHERE rc.product_code = _product_code
    AND rc.is_active = true
    AND _tenor_days BETWEEN rc.min_tenor_days AND rc.max_tenor_days
    AND _amount >= rc.min_amount
    AND (rc.max_amount IS NULL OR _amount <= rc.max_amount)
  ORDER BY rc.priority DESC, rc.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_tier.user_rate::NUMERIC, v_tier.vfd_rate::NUMERIC, 'tier'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_product
  FROM public.vestara_products
  WHERE code = _product_code AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found or inactive', _product_code;
  END IF;

  IF v_product.max_tenor_days = v_product.min_tenor_days THEN
    v_user_rate := v_product.min_user_rate;
  ELSE
    v_user_rate := v_product.min_user_rate +
      (v_product.max_user_rate - v_product.min_user_rate) *
      ((_tenor_days - v_product.min_tenor_days)::NUMERIC /
       (v_product.max_tenor_days - v_product.min_tenor_days)::NUMERIC);
  END IF;

  RETURN QUERY SELECT
    ROUND(v_user_rate, 3)::NUMERIC,
    v_product.vfd_rate::NUMERIC,
    'product_default'::TEXT;
END;
$$;

-- ============================================================
-- UPDATE vestara_create_savings TO USE RATE RESOLVER
-- ============================================================
CREATE OR REPLACE FUNCTION public.vestara_create_savings(
  _user_id UUID,
  _product_code public.vestara_product_code,
  _principal NUMERIC,
  _tenor_days INTEGER,
  _reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT * INTO v_wallet
  FROM public.vestara_accounts
  WHERE user_id = _user_id AND account_type = 'wallet'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_wallet.balance < _principal THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  v_reference := COALESCE(_reference, 'savings-' || gen_random_uuid()::TEXT);
  v_maturity_date := now() + (_tenor_days || ' days')::INTERVAL;

  INSERT INTO public.vestara_accounts (user_id, account_type, balance, currency, metadata)
  VALUES (
    _user_id,
    'locked_savings',
    _principal,
    v_wallet.currency,
    jsonb_build_object(
      'product_code', _product_code,
      'tenor_days', _tenor_days,
      'user_rate', v_user_rate,
      'vfd_rate', v_vfd_rate,
      'rate_source', v_rate_source,
      'locked_at', now()
    )
  )
  RETURNING * INTO v_lock_account;

  UPDATE public.vestara_accounts
  SET balance = balance - _principal, updated_at = now()
  WHERE id = v_wallet.id;

  INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
  VALUES (
    'lock_funds',
    'completed',
    v_reference,
    _principal,
    _user_id,
    jsonb_build_object(
      'product_code', _product_code,
      'tenor_days', _tenor_days,
      'user_rate', v_user_rate,
      'vfd_rate', v_vfd_rate,
      'rate_source', v_rate_source
    )
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES
    (v_tx_id, v_wallet.id, _principal, 0),
    (v_tx_id, v_lock_account.id, 0, _principal);

  IF v_product.is_upfront_yield THEN
    v_time_frac := _tenor_days::NUMERIC / 365.0;
    v_discounted_interest := ROUND(
      (_principal * (v_user_rate / 100.0) * v_time_frac) /
      (1 + (v_user_rate / 100.0) * v_time_frac),
      2
    );
    v_effective_rate := ROUND(
      (v_discounted_interest / _principal) * (365.0 / _tenor_days) * 100,
      3
    );

    IF v_discounted_interest > 0 THEN
      UPDATE public.vestara_accounts
      SET balance = balance + v_discounted_interest, updated_at = now()
      WHERE id = v_wallet.id;

      INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
      VALUES (
        'upfront_interest',
        'completed',
        v_reference || '-upfront',
        v_discounted_interest,
        _user_id,
        jsonb_build_object('savings_reference', v_reference, 'effective_rate', v_effective_rate)
      )
      RETURNING id INTO v_tx_id;

      INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
      VALUES (v_tx_id, v_wallet.id, 0, v_discounted_interest);
    END IF;
  END IF;

  INSERT INTO public.vestara_savings (
    user_id, product_id, product_code, lock_account_id,
    principal, original_principal,
    user_rate, vfd_rate, tenor_days,
    start_date, maturity_date,
    discounted_interest_paid, effective_rate,
    status, metadata
  ) VALUES (
    _user_id, v_product.id, _product_code, v_lock_account.id,
    _principal, _principal,
    v_user_rate, v_vfd_rate, _tenor_days,
    now(), v_maturity_date,
    v_discounted_interest, v_effective_rate,
    'active',
    jsonb_build_object('reference', v_reference, 'rate_source', v_rate_source)
  )
  RETURNING id INTO v_savings_id;

  UPDATE public.vestara_treasury
  SET total_locked_funds = total_locked_funds + _principal,
      total_invested_with_vfd = ROUND((total_locked_funds + _principal) * 0.8, 2),
      liquidity_buffer = ROUND((total_locked_funds + _principal) * 0.2, 2),
      updated_at = now()
  WHERE id = (SELECT id FROM public.vestara_treasury LIMIT 1);

  RETURN jsonb_build_object(
    'savings_id', v_savings_id,
    'reference', v_reference,
    'user_rate', v_user_rate,
    'vfd_rate', v_vfd_rate,
    'rate_source', v_rate_source,
    'discounted_interest_paid', v_discounted_interest,
    'effective_rate', v_effective_rate,
    'maturity_date', v_maturity_date
  );
END;
$$;

-- ============================================================
-- SEED DEFAULT RATE TIERS
-- ============================================================
INSERT INTO public.vestara_rate_configs (product_code, min_tenor_days, max_tenor_days, min_amount, max_amount, user_rate, vfd_rate, priority, notes) VALUES
  ('goalsave',  90, 179,        0,   500000, 10.000, 18.000, 10, 'Short tenor / small balance'),
  ('goalsave',  90, 179,   500000,  NULL,    11.000, 18.000, 20, 'Short tenor / large balance'),
  ('goalsave', 180, 269,        0,   500000, 12.500, 18.000, 10, 'Mid tenor / small balance'),
  ('goalsave', 180, 269,   500000,  NULL,    13.500, 18.000, 20, 'Mid tenor / large balance'),
  ('goalsave', 270, 365,        0,   500000, 15.000, 18.000, 10, 'Long tenor / small balance'),
  ('goalsave', 270, 365,   500000,  NULL,    16.000, 18.000, 20, 'Long tenor / large balance'),
  ('vault',  30,  89,        0,  1000000, 14.000, 22.000, 10, 'Short tenor'),
  ('vault',  30,  89,  1000000,  NULL,    14.500, 22.000, 20, 'Short tenor / large balance'),
  ('vault',  90, 179,        0,  1000000, 16.000, 22.000, 10, 'Mid tenor'),
  ('vault',  90, 179,  1000000,  NULL,    17.000, 22.000, 20, 'Mid tenor / large balance'),
  ('vault', 180, 269,        0,  1000000, 18.500, 22.000, 10, 'Long tenor'),
  ('vault', 180, 269,  1000000,  NULL,    19.500, 22.000, 20, 'Long tenor / large balance'),
  ('vault', 270, 365,        0,  1000000, 19.500, 22.000, 10, 'Max tenor'),
  ('vault', 270, 365,  1000000,  NULL,    20.500, 22.000, 20, 'Max tenor / large balance'),
  ('lockmax',  90, 179,        0,  2000000, 18.000, 23.500, 10, 'Short tenor'),
  ('lockmax',  90, 179,  2000000,  NULL,    18.500, 23.500, 20, 'Short tenor / large balance'),
  ('lockmax', 180, 269,        0,  2000000, 19.500, 23.500, 10, 'Mid tenor'),
  ('lockmax', 180, 269,  2000000,  NULL,    20.000, 23.500, 20, 'Mid tenor / large balance'),
  ('lockmax', 270, 365,        0,  2000000, 20.500, 23.500, 10, 'Long tenor'),
  ('lockmax', 270, 365,  2000000,  NULL,    21.000, 23.500, 20, 'Long tenor / large balance'),
  ('upfront_yield',  30,  89,        0,  1000000, 12.000, 22.000, 10, 'Short tenor'),
  ('upfront_yield',  30,  89,  1000000,  NULL,    13.000, 22.000, 20, 'Short tenor / large balance'),
  ('upfront_yield',  90, 179,        0,  1000000, 14.000, 22.000, 10, 'Mid tenor'),
  ('upfront_yield',  90, 179,  1000000,  NULL,    15.000, 22.000, 20, 'Mid tenor / large balance'),
  ('upfront_yield', 180, 365,        0,  1000000, 17.000, 22.000, 10, 'Long tenor'),
  ('upfront_yield', 180, 365,  1000000,  NULL,    18.000, 22.000, 20, 'Long tenor / large balance')
ON CONFLICT DO NOTHING;
