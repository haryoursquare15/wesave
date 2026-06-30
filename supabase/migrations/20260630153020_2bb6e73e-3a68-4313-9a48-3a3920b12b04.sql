
-- 1. New columns on vestara_savings
ALTER TABLE public.vestara_savings
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approval_decision_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approval_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS approval_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_account_id uuid REFERENCES public.vestara_accounts(id);

CREATE INDEX IF NOT EXISTS idx_vestara_savings_approval_status
  ON public.vestara_savings(approval_status) WHERE approval_status = 'pending';

-- 2. RPC: create pending savings (debit wallet -> hold in pending_savings account)
CREATE OR REPLACE FUNCTION public.vestara_create_savings_pending(
  _user_id uuid,
  _product_code vestara_product_code,
  _principal numeric,
  _tenor_days integer,
  _reference text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product RECORD;
  v_wallet RECORD;
  v_pending_account RECORD;
  v_lock_account RECORD;
  v_savings_id uuid;
  v_user_rate numeric;
  v_vfd_rate numeric;
  v_rate_source text;
  v_tx_id uuid;
  v_reference text;
BEGIN
  IF _principal <= 0 THEN RAISE EXCEPTION 'Principal must be positive'; END IF;

  SELECT * INTO v_product
  FROM public.vestara_products
  WHERE code = _product_code AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found or inactive', _product_code; END IF;

  IF _tenor_days < v_product.min_tenor_days OR _tenor_days > v_product.max_tenor_days THEN
    RAISE EXCEPTION 'Tenor % outside allowed range %-% for product %',
      _tenor_days, v_product.min_tenor_days, v_product.max_tenor_days, _product_code;
  END IF;

  SELECT r.user_rate, r.vfd_rate, r.source
    INTO v_user_rate, v_vfd_rate, v_rate_source
  FROM public.vestara_resolve_rate(_product_code, _tenor_days, _principal) r;

  IF v_user_rate IS NULL OR v_vfd_rate IS NULL OR v_vfd_rate <= v_user_rate THEN
    RAISE EXCEPTION 'Invalid rate configuration';
  END IF;

  SELECT * INTO v_wallet FROM public.vestara_accounts
   WHERE user_id = _user_id AND account_type = 'wallet' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_wallet.balance < _principal THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  v_reference := COALESCE(_reference, 'vestara-savings-pend-' || gen_random_uuid()::text);

  -- Pending hold account (per-savings)
  INSERT INTO public.vestara_accounts (user_id, account_type, balance, currency, metadata)
  VALUES (_user_id, 'pending_savings', 0, 'NGN', jsonb_build_object(
    'product_code', _product_code,
    'tenor_days', _tenor_days,
    'created_for', 'vestara_savings_pending'
  ))
  RETURNING * INTO v_pending_account;

  -- Placeholder lock account (created up-front, funds move on approval)
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
  VALUES ('savings_pending_hold', 'completed', v_reference, _principal, _user_id, jsonb_build_object(
    'product_code', _product_code,
    'tenor_days', _tenor_days,
    'pending_account_id', v_pending_account.id
  ))
  RETURNING id INTO v_tx_id;

  UPDATE public.vestara_accounts SET balance = balance - _principal, updated_at = now() WHERE id = v_wallet.id;
  UPDATE public.vestara_accounts SET balance = balance + _principal, updated_at = now() WHERE id = v_pending_account.id;

  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES (v_tx_id, v_wallet.id, _principal, 0),
         (v_tx_id, v_pending_account.id, 0, _principal);

  INSERT INTO public.vestara_savings (
    user_id, product_id, product_code, lock_account_id, pending_account_id,
    principal, original_principal, user_rate, vfd_rate, tenor_days,
    start_date, maturity_date, accrued_interest, discounted_interest_paid,
    status, approval_status, approval_submitted_at, metadata
  ) VALUES (
    _user_id, v_product.id, _product_code, v_lock_account.id, v_pending_account.id,
    _principal, _principal, v_user_rate, v_vfd_rate, _tenor_days,
    now(), now() + (_tenor_days || ' days')::interval, 0, 0,
    'active', 'pending', now(),
    jsonb_build_object('rate_source', v_rate_source, 'pending_tx_id', v_tx_id, 'pending_reference', v_reference)
  ) RETURNING id INTO v_savings_id;

  RETURN jsonb_build_object(
    'success', true,
    'savings_id', v_savings_id,
    'approval_status', 'pending',
    'principal_held', _principal,
    'pending_account_id', v_pending_account.id,
    'reference', v_reference
  );
END;
$$;

-- 3. RPC: approve (move pending -> locked; pay upfront yield if applicable)
CREATE OR REPLACE FUNCTION public.vestara_approve_savings(
  _admin_id uuid,
  _savings_id uuid,
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_savings RECORD;
  v_product RECORD;
  v_pending RECORD;
  v_lock RECORD;
  v_wallet RECORD;
  v_tx_id uuid;
  v_ref text;
  v_time_frac numeric;
  v_discounted numeric := 0;
  v_effective numeric := NULL;
  v_maturity timestamptz;
BEGIN
  IF NOT (public.has_role(_admin_id, 'admin'::app_role) OR public.has_role(_admin_id, 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can approve investments';
  END IF;

  SELECT * INTO v_savings FROM public.vestara_savings WHERE id = _savings_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings not found'; END IF;
  IF v_savings.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Savings already %', v_savings.approval_status;
  END IF;

  SELECT * INTO v_product FROM public.vestara_products WHERE id = v_savings.product_id;
  SELECT * INTO v_pending FROM public.vestara_accounts WHERE id = v_savings.pending_account_id FOR UPDATE;
  SELECT * INTO v_lock    FROM public.vestara_accounts WHERE id = v_savings.lock_account_id    FOR UPDATE;
  SELECT * INTO v_wallet  FROM public.vestara_accounts WHERE user_id = v_savings.user_id AND account_type='wallet' FOR UPDATE;

  IF v_pending.balance < v_savings.principal THEN
    RAISE EXCEPTION 'Pending hold balance mismatch';
  END IF;

  v_ref := 'vestara-savings-approve-' || _savings_id::text;
  INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
  VALUES ('savings_approve', 'completed', v_ref, v_savings.principal, _admin_id,
          jsonb_build_object('savings_id', _savings_id, 'user_id', v_savings.user_id))
  RETURNING id INTO v_tx_id;

  UPDATE public.vestara_accounts SET balance = balance - v_savings.principal, updated_at=now() WHERE id = v_pending.id;
  UPDATE public.vestara_accounts SET balance = balance + v_savings.principal, updated_at=now() WHERE id = v_lock.id;

  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES (v_tx_id, v_pending.id, v_savings.principal, 0),
         (v_tx_id, v_lock.id,    0, v_savings.principal);

  v_maturity := now() + (v_savings.tenor_days || ' days')::interval;

  -- Upfront yield: pay discounted interest to wallet at approval time
  IF v_product.is_upfront_yield THEN
    v_time_frac := v_savings.tenor_days::numeric / 365.0;
    v_discounted := ROUND(
      (v_savings.principal * (v_savings.user_rate/100.0) * v_time_frac)
      / (1 + (v_savings.user_rate/100.0) * v_time_frac), 2);
    v_effective := CASE WHEN v_savings.principal > 0
      THEN ROUND((v_discounted / v_savings.principal) * (365.0 / v_savings.tenor_days) * 100, 4) ELSE NULL END;
    IF v_discounted > 0 THEN
      UPDATE public.vestara_accounts SET balance = balance + v_discounted, updated_at=now() WHERE id = v_wallet.id;
      INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
      VALUES (v_tx_id, v_wallet.id, 0, v_discounted);
    END IF;
  END IF;

  UPDATE public.vestara_savings
     SET approval_status='approved',
         approval_decision_by=_admin_id,
         approval_decision_at=now(),
         approval_notes=_notes,
         start_date=now(),
         maturity_date=v_maturity,
         discounted_interest_paid = COALESCE(v_discounted, 0),
         effective_rate = COALESCE(v_effective, effective_rate),
         updated_at=now()
   WHERE id = _savings_id;

  RETURN jsonb_build_object('success', true, 'savings_id', _savings_id, 'maturity_date', v_maturity, 'upfront_paid', v_discounted);
END;
$$;

-- 4. RPC: reject (refund pending -> wallet, cancel savings)
CREATE OR REPLACE FUNCTION public.vestara_reject_savings(
  _admin_id uuid,
  _savings_id uuid,
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_savings RECORD;
  v_pending RECORD;
  v_wallet RECORD;
  v_tx_id uuid;
  v_ref text;
  v_amt numeric;
BEGIN
  IF NOT (public.has_role(_admin_id, 'admin'::app_role) OR public.has_role(_admin_id, 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can reject investments';
  END IF;

  SELECT * INTO v_savings FROM public.vestara_savings WHERE id = _savings_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings not found'; END IF;
  IF v_savings.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Savings already %', v_savings.approval_status;
  END IF;

  SELECT * INTO v_pending FROM public.vestara_accounts WHERE id = v_savings.pending_account_id FOR UPDATE;
  SELECT * INTO v_wallet  FROM public.vestara_accounts WHERE user_id = v_savings.user_id AND account_type='wallet' FOR UPDATE;
  v_amt := v_pending.balance;

  v_ref := 'vestara-savings-reject-' || _savings_id::text;
  INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
  VALUES ('savings_reject_refund', 'completed', v_ref, v_amt, _admin_id,
          jsonb_build_object('savings_id', _savings_id, 'user_id', v_savings.user_id, 'reason', _notes))
  RETURNING id INTO v_tx_id;

  IF v_amt > 0 THEN
    UPDATE public.vestara_accounts SET balance = balance - v_amt, updated_at=now() WHERE id = v_pending.id;
    UPDATE public.vestara_accounts SET balance = balance + v_amt, updated_at=now() WHERE id = v_wallet.id;
    INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
    VALUES (v_tx_id, v_pending.id, v_amt, 0),
           (v_tx_id, v_wallet.id, 0, v_amt);
  END IF;

  UPDATE public.vestara_savings
     SET approval_status='rejected',
         approval_decision_by=_admin_id,
         approval_decision_at=now(),
         approval_notes=_notes,
         status='cancelled',
         updated_at=now()
   WHERE id = _savings_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_amt);
END;
$$;

GRANT EXECUTE ON FUNCTION public.vestara_create_savings_pending(uuid, vestara_product_code, numeric, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vestara_approve_savings(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vestara_reject_savings(uuid, uuid, text) TO authenticated, service_role;
