-- ============ FIX A/C: new tracking columns ============
ALTER TABLE public.vestara_savings
  ADD COLUMN IF NOT EXISTS subaccount_funded_at timestamptz,
  ADD COLUMN IF NOT EXISTS vfd_confirmation_reference text,
  ADD COLUMN IF NOT EXISTS vfd_confirmation_note text,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sub_account_reversal_ref text,
  ADD COLUMN IF NOT EXISTS sub_account_reversed_at timestamptz;

-- backfill for rows already physically moved under the old flow
UPDATE public.vestara_savings
   SET subaccount_funded_at = sub_account_transferred_at
 WHERE sub_account_transferred_at IS NOT NULL AND subaccount_funded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vestara_savings_pending_aging
  ON public.vestara_savings (approval_status, subaccount_funded_at)
  WHERE approval_status = 'pending';

-- ============ FIX D3: real deferred balance constraint ============
CREATE OR REPLACE FUNCTION public.vestara_validate_balance_on_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _d numeric; _c numeric; _st text;
BEGIN
  SELECT status INTO _st FROM vestara_transactions WHERE id = NEW.transaction_id;
  IF _st IS DISTINCT FROM 'completed' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO _d, _c
    FROM vestara_ledger_entries
   WHERE transaction_id = NEW.transaction_id;

  IF _d <> _c THEN
    RAISE EXCEPTION 'Unbalanced ledger transaction %: debit=% credit=%', NEW.transaction_id, _d, _c;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_vestara_validate_entry ON public.vestara_ledger_entries;
CREATE CONSTRAINT TRIGGER trg_vestara_validate_entry
  AFTER INSERT ON public.vestara_ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.vestara_validate_balance_on_entry();

-- ============ FIX D2: create pending via vestara_post_transaction ============
CREATE OR REPLACE FUNCTION public.vestara_create_savings_pending(_user_id uuid, _product_code vestara_product_code, _principal numeric, _tenor_days integer, _reference text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product RECORD;
  v_wallet RECORD;
  v_pending_account RECORD;
  v_lock_account RECORD;
  v_savings_id uuid;
  v_user_rate numeric;
  v_vfd_rate numeric;
  v_rate_source text;
  v_reference text;
  v_post jsonb;
BEGIN
  IF _principal <= 0 THEN RAISE EXCEPTION 'Principal must be positive'; END IF;

  SELECT * INTO v_product FROM public.vestara_products
   WHERE code = _product_code AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found or inactive', _product_code; END IF;

  IF _tenor_days < v_product.min_tenor_days OR _tenor_days > v_product.max_tenor_days THEN
    RAISE EXCEPTION 'Tenor % outside allowed range %-% for product %',
      _tenor_days, v_product.min_tenor_days, v_product.max_tenor_days, _product_code;
  END IF;

  SELECT r.user_rate, r.vfd_rate, r.source INTO v_user_rate, v_vfd_rate, v_rate_source
  FROM public.vestara_resolve_rate(_product_code, _tenor_days, _principal) r;

  IF v_user_rate IS NULL OR v_vfd_rate IS NULL OR v_vfd_rate <= v_user_rate THEN
    RAISE EXCEPTION 'Invalid rate configuration';
  END IF;

  SELECT * INTO v_wallet FROM public.vestara_accounts
   WHERE user_id = _user_id AND account_type = 'wallet' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_wallet.balance < _principal THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  v_reference := COALESCE(_reference, 'vestara-savings-pend-' || gen_random_uuid()::text);

  INSERT INTO public.vestara_accounts (user_id, account_type, balance, currency, metadata)
  VALUES (_user_id, 'pending_savings', 0, 'NGN', jsonb_build_object(
    'product_code', _product_code, 'tenor_days', _tenor_days, 'created_for', 'vestara_savings_pending'))
  RETURNING * INTO v_pending_account;

  INSERT INTO public.vestara_accounts (user_id, account_type, balance, currency, metadata)
  VALUES (_user_id, 'locked_savings', 0, 'NGN', jsonb_build_object(
    'product_code', _product_code, 'tenor_days', _tenor_days, 'user_rate', v_user_rate,
    'vfd_rate', v_vfd_rate, 'rate_source', v_rate_source, 'created_for', 'vestara_savings'))
  RETURNING * INTO v_lock_account;

  v_post := public.vestara_post_transaction(
    'savings_pending_hold'::vestara_tx_type, v_reference, _principal, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_wallet.id, 'debit', _principal, 'credit', 0),
      jsonb_build_object('account_id', v_pending_account.id, 'debit', 0, 'credit', _principal)
    ),
    jsonb_build_object('product_code', _product_code, 'tenor_days', _tenor_days,
                       'pending_account_id', v_pending_account.id)
  );
  IF COALESCE((v_post->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Ledger posting failed: %', COALESCE(v_post->>'error', 'unknown');
  END IF;

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
    jsonb_build_object('rate_source', v_rate_source, 'pending_tx_id', v_post->>'transaction_id',
                       'pending_reference', v_reference)
  ) RETURNING id INTO v_savings_id;

  RETURN jsonb_build_object('success', true, 'savings_id', v_savings_id,
    'approval_status', 'pending', 'principal_held', _principal,
    'pending_account_id', v_pending_account.id, 'reference', v_reference);
END;
$function$;

-- ============ FIX B/C/D: approval = pure status flip + confirmation ============
DROP FUNCTION IF EXISTS public.vestara_approve_savings(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.vestara_approve_savings(
  _admin_id uuid,
  _savings_id uuid,
  _vfd_confirmation_reference text,
  _notes text DEFAULT NULL::text,
  _vfd_confirmation_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_savings RECORD;
  v_product RECORD;
  v_pending RECORD;
  v_wallet RECORD;
  v_expense RECORD;
  v_time_frac numeric;
  v_discounted numeric := 0;
  v_effective numeric := NULL;
  v_maturity timestamptz;
  v_now timestamptz := now();
  v_post jsonb;
BEGIN
  IF NOT (public.has_role(_admin_id, 'admin'::app_role) OR public.has_role(_admin_id, 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can approve investments';
  END IF;

  IF _vfd_confirmation_reference IS NULL OR btrim(_vfd_confirmation_reference) = '' THEN
    RAISE EXCEPTION 'A VFD placement confirmation reference is required before approving';
  END IF;

  SELECT * INTO v_savings FROM public.vestara_savings WHERE id = _savings_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings not found'; END IF;

  -- Idempotent: repeat approval is a no-op success, never double-posts.
  IF v_savings.approval_status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true,
      'savings_id', _savings_id, 'maturity_date', v_savings.maturity_date,
      'upfront_paid', v_savings.discounted_interest_paid);
  END IF;
  IF v_savings.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Savings already %', v_savings.approval_status;
  END IF;

  SELECT * INTO v_product FROM public.vestara_products WHERE id = v_savings.product_id;
  SELECT * INTO v_pending FROM public.vestara_accounts WHERE id = v_savings.pending_account_id FOR UPDATE;
  IF v_pending.balance < v_savings.principal THEN
    RAISE EXCEPTION 'Pending hold balance mismatch';
  END IF;

  -- Internal move: pending hold -> locked savings (no real money moves here).
  v_post := public.vestara_post_transaction(
    'savings_approve'::vestara_tx_type,
    'vestara-savings-approve-' || _savings_id::text,
    v_savings.principal, _admin_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_savings.pending_account_id, 'debit', v_savings.principal, 'credit', 0),
      jsonb_build_object('account_id', v_savings.lock_account_id, 'debit', 0, 'credit', v_savings.principal)
    ),
    jsonb_build_object('savings_id', _savings_id, 'user_id', v_savings.user_id,
                       'vfd_confirmation_reference', _vfd_confirmation_reference)
  );
  IF COALESCE((v_post->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Ledger posting failed: %', COALESCE(v_post->>'error', 'unknown');
  END IF;

  -- Interest clock starts NOW (VFD placement confirmed), not at subscription.
  v_maturity := v_now + (v_savings.tenor_days || ' days')::interval;

  IF v_product.is_upfront_yield THEN
    v_time_frac := v_savings.tenor_days::numeric / 365.0;
    v_discounted := ROUND(
      (v_savings.principal * (v_savings.user_rate/100.0) * v_time_frac)
      / (1 + (v_savings.user_rate/100.0) * v_time_frac), 2);
    v_effective := CASE WHEN v_savings.principal > 0
      THEN ROUND((v_discounted / v_savings.principal) * (365.0 / v_savings.tenor_days) * 100, 4) ELSE NULL END;

    IF v_discounted > 0 THEN
      SELECT * INTO v_wallet FROM public.vestara_accounts
       WHERE user_id = v_savings.user_id AND account_type = 'wallet' FOR UPDATE;
      SELECT * INTO v_expense FROM public.vestara_accounts
       WHERE account_type = 'interest_expense' AND user_id IS NULL ORDER BY created_at LIMIT 1;
      IF NOT FOUND THEN
        INSERT INTO public.vestara_accounts (user_id, account_type, balance, currency, is_system, metadata)
        VALUES (NULL, 'interest_expense', 0, 'NGN', true, jsonb_build_object('created_for','upfront_yield'))
        RETURNING * INTO v_expense;
      END IF;

      v_post := public.vestara_post_transaction(
        'interest_payout'::vestara_tx_type,
        'vestara-savings-upfront-' || _savings_id::text,
        v_discounted, _admin_id,
        jsonb_build_array(
          jsonb_build_object('account_id', v_expense.id, 'debit', v_discounted, 'credit', 0),
          jsonb_build_object('account_id', v_wallet.id, 'debit', 0, 'credit', v_discounted)
        ),
        jsonb_build_object('savings_id', _savings_id, 'user_id', v_savings.user_id, 'kind', 'upfront_yield')
      );
      IF COALESCE((v_post->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Upfront yield posting failed: %', COALESCE(v_post->>'error', 'unknown');
      END IF;
    END IF;
  END IF;

  UPDATE public.vestara_savings
     SET approval_status='approved',
         approval_decision_by=_admin_id,
         approval_decision_at=v_now,
         approval_notes=_notes,
         vfd_confirmation_reference=btrim(_vfd_confirmation_reference),
         vfd_confirmation_note=_vfd_confirmation_note,
         confirmed_by=_admin_id,
         confirmed_at=v_now,
         start_date=v_now,
         maturity_date=v_maturity,
         last_accrued_on=NULL,
         discounted_interest_paid=COALESCE(v_discounted,0),
         effective_rate=COALESCE(v_effective, effective_rate),
         updated_at=v_now
   WHERE id = _savings_id;

  RETURN jsonb_build_object('success', true, 'savings_id', _savings_id,
    'maturity_date', v_maturity, 'upfront_paid', v_discounted,
    'vfd_confirmation_reference', btrim(_vfd_confirmation_reference));
END;
$function$;

-- ============ FIX D4/D5: rejection requires real reversal first ============
CREATE OR REPLACE FUNCTION public.vestara_reject_savings(_admin_id uuid, _savings_id uuid, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_savings RECORD;
  v_pending RECORD;
  v_wallet RECORD;
  v_amt numeric;
  v_post jsonb;
BEGIN
  IF NOT (public.has_role(_admin_id, 'admin'::app_role) OR public.has_role(_admin_id, 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can reject investments';
  END IF;

  SELECT * INTO v_savings FROM public.vestara_savings WHERE id = _savings_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings not found'; END IF;

  IF v_savings.approval_status = 'rejected' THEN
    RETURN jsonb_build_object('success', true, 'already_rejected', true, 'refunded', 0);
  END IF;
  IF v_savings.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Savings already %', v_savings.approval_status;
  END IF;

  -- Real money already sits in the product sub-account at VFD: the bank-level
  -- reversal must be completed (and stamped) before the internal reversal.
  IF v_savings.sub_account_transferred_at IS NOT NULL
     AND v_savings.sub_account_reversed_at IS NULL THEN
    RAISE EXCEPTION 'REVERSAL_REQUIRED: funds are physically in the product sub-account; complete the VFD reversal transfer first';
  END IF;

  SELECT * INTO v_pending FROM public.vestara_accounts WHERE id = v_savings.pending_account_id FOR UPDATE;
  SELECT * INTO v_wallet  FROM public.vestara_accounts
   WHERE user_id = v_savings.user_id AND account_type='wallet' FOR UPDATE;
  v_amt := COALESCE(v_pending.balance, 0);

  IF v_amt > 0 THEN
    v_post := public.vestara_post_transaction(
      'savings_reject_refund'::vestara_tx_type,
      'vestara-savings-reject-' || _savings_id::text,
      v_amt, _admin_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_pending.id, 'debit', v_amt, 'credit', 0),
        jsonb_build_object('account_id', v_wallet.id, 'debit', 0, 'credit', v_amt)
      ),
      jsonb_build_object('savings_id', _savings_id, 'user_id', v_savings.user_id, 'reason', _notes,
                         'real_reversal_ref', v_savings.sub_account_reversal_ref)
    );
    IF COALESCE((v_post->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Refund posting failed: %', COALESCE(v_post->>'error', 'unknown');
    END IF;
  END IF;

  UPDATE public.vestara_savings
     SET approval_status='rejected', approval_decision_by=_admin_id, approval_decision_at=now(),
         approval_notes=_notes, status='cancelled', updated_at=now()
   WHERE id = _savings_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_amt,
    'real_reversal_ref', v_savings.sub_account_reversal_ref);
END;
$function$;

-- ============ FIX E: aging pending placements ============
CREATE OR REPLACE FUNCTION public.vestara_aging_pending_savings(_threshold_hours integer DEFAULT 48)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'threshold_hours', _threshold_hours,
    'count', COALESCE(COUNT(*), 0),
    'total_principal', COALESCE(SUM(s.principal), 0),
    'items', COALESCE(jsonb_agg(jsonb_build_object(
        'savings_id', s.id, 'user_id', s.user_id, 'product_code', s.product_code,
        'principal', s.principal, 'subaccount_funded_at', s.subaccount_funded_at,
        'approval_submitted_at', s.approval_submitted_at,
        'hours_pending', ROUND(EXTRACT(EPOCH FROM (now() - s.subaccount_funded_at))/3600.0, 1)
      ) ORDER BY s.subaccount_funded_at), '[]'::jsonb)
  )
  FROM public.vestara_savings s
  WHERE s.approval_status = 'pending'
    AND s.subaccount_funded_at IS NOT NULL
    AND s.subaccount_funded_at < now() - make_interval(hours => _threshold_hours);
$function$;

-- ============ zero interest while pending ============
CREATE OR REPLACE FUNCTION public.vestara_accrue_daily_interest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_total_user numeric := 0;
  v_total_vfd  numeric := 0;
  r record;
  v_user_int numeric;
  v_vfd_int  numeric;
BEGIN
  IF NOT pg_try_advisory_xact_lock(8123456789012345) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_running');
  END IF;

  FOR r IN
    SELECT id, principal, user_rate, vfd_rate, product_code
      FROM public.vestara_savings
     WHERE status = 'active'
       AND approval_status = 'approved'
       AND product_code <> 'upfront_yield'
       AND maturity_date > now()
       AND (last_accrued_on IS NULL OR last_accrued_on < CURRENT_DATE)
     FOR UPDATE
  LOOP
    v_user_int := ROUND(r.principal * (r.user_rate / 100.0) / 365.0, 2);
    v_vfd_int  := ROUND(r.principal * (r.vfd_rate  / 100.0) / 365.0, 2);

    UPDATE public.vestara_savings
       SET accrued_interest = accrued_interest + v_user_int,
           last_accrued_on  = CURRENT_DATE
     WHERE id = r.id
       AND (last_accrued_on IS NULL OR last_accrued_on < CURRENT_DATE);

    IF FOUND THEN
      v_total_user := v_total_user + v_user_int;
      v_total_vfd  := v_total_vfd  + v_vfd_int;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count > 0 THEN
    UPDATE public.vestara_treasury
       SET total_interest_paid     = total_interest_paid + v_total_user,
           total_interest_from_vfd = total_interest_from_vfd + v_total_vfd,
           interest_spread_profit  = interest_spread_profit + (v_total_vfd - v_total_user),
           updated_at = now()
     WHERE id IS NOT NULL;
  END IF;

  RETURN jsonb_build_object('success', true, 'accrued_count', v_count,
    'user_interest', v_total_user, 'vfd_interest', v_total_vfd,
    'spread', v_total_vfd - v_total_user, 'accrual_date', CURRENT_DATE);
END;
$function$;