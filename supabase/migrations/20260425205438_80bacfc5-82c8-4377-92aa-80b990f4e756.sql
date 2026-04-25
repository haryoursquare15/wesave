-- ============================================================
-- VESTARA SAVINGS PRODUCT SYSTEM
-- ============================================================

-- Status enum for savings instances
DO $$ BEGIN
  CREATE TYPE public.vestara_savings_status AS ENUM ('active','matured','early_withdrawn','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Product code enum
DO $$ BEGIN
  CREATE TYPE public.vestara_product_code AS ENUM ('goalsave','vault','lockmax','upfront_yield');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────── Products catalog ───────────
CREATE TABLE IF NOT EXISTS public.vestara_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code public.vestara_product_code NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  min_user_rate numeric(5,2) NOT NULL,   -- annual %
  max_user_rate numeric(5,2) NOT NULL,
  vfd_rate numeric(5,2) NOT NULL,        -- annual %
  min_tenor_days integer NOT NULL,
  max_tenor_days integer NOT NULL,
  early_withdrawal_penalty_pct numeric(5,2) NOT NULL DEFAULT 0, -- of accrued interest
  allow_early_withdrawal boolean NOT NULL DEFAULT true,
  is_upfront_yield boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vestara_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active products" ON public.vestara_products;
CREATE POLICY "Anyone can view active products"
  ON public.vestara_products FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage products" ON public.vestara_products;
CREATE POLICY "Admins can manage products"
  ON public.vestara_products FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_vestara_products_updated
  BEFORE UPDATE ON public.vestara_products
  FOR EACH ROW EXECUTE FUNCTION public.vestara_update_timestamp();

-- ─────────── Savings instances ───────────
CREATE TABLE IF NOT EXISTS public.vestara_savings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.vestara_products(id),
  product_code public.vestara_product_code NOT NULL,
  lock_account_id uuid NOT NULL REFERENCES public.vestara_accounts(id),
  principal numeric(18,2) NOT NULL CHECK (principal > 0),
  original_principal numeric(18,2) NOT NULL,
  user_rate numeric(5,2) NOT NULL,
  vfd_rate numeric(5,2) NOT NULL,
  tenor_days integer NOT NULL CHECK (tenor_days > 0),
  start_date timestamptz NOT NULL DEFAULT now(),
  maturity_date timestamptz NOT NULL,
  accrued_interest numeric(18,2) NOT NULL DEFAULT 0,
  discounted_interest_paid numeric(18,2) NOT NULL DEFAULT 0,
  effective_rate numeric(7,4),
  status public.vestara_savings_status NOT NULL DEFAULT 'active',
  matured_at timestamptz,
  withdrawn_at timestamptz,
  penalty_amount numeric(18,2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vestara_savings_user ON public.vestara_savings(user_id);
CREATE INDEX IF NOT EXISTS idx_vestara_savings_status ON public.vestara_savings(status);
CREATE INDEX IF NOT EXISTS idx_vestara_savings_maturity ON public.vestara_savings(maturity_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_vestara_savings_lock_account ON public.vestara_savings(lock_account_id);

ALTER TABLE public.vestara_savings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own savings" ON public.vestara_savings;
CREATE POLICY "Users view own savings"
  ON public.vestara_savings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins view all savings" ON public.vestara_savings;
CREATE POLICY "Admins view all savings"
  ON public.vestara_savings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_vestara_savings_updated
  BEFORE UPDATE ON public.vestara_savings
  FOR EACH ROW EXECUTE FUNCTION public.vestara_update_timestamp();

-- ─────────── Treasury (single row) ───────────
CREATE TABLE IF NOT EXISTS public.vestara_treasury (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_locked_funds numeric(18,2) NOT NULL DEFAULT 0,
  total_invested_with_vfd numeric(18,2) NOT NULL DEFAULT 0,
  liquidity_buffer numeric(18,2) NOT NULL DEFAULT 0,
  total_interest_from_vfd numeric(18,2) NOT NULL DEFAULT 0,
  total_interest_paid numeric(18,2) NOT NULL DEFAULT 0,
  interest_spread_profit numeric(18,2) NOT NULL DEFAULT 0,
  invest_ratio numeric(5,4) NOT NULL DEFAULT 0.80,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vestara_treasury_singleton CHECK (id IS NOT NULL)
);

-- Ensure a single row exists
INSERT INTO public.vestara_treasury (total_locked_funds)
SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM public.vestara_treasury);

ALTER TABLE public.vestara_treasury ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view treasury" ON public.vestara_treasury;
CREATE POLICY "Admins view treasury"
  ON public.vestara_treasury FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ─────────── Reconciliation findings ───────────
CREATE TABLE IF NOT EXISTS public.vestara_reconciliation_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  check_name text NOT NULL,         -- 'wallet_vs_vfd', 'locked_vs_treasury', 'liquidity'
  expected numeric(18,2),
  actual numeric(18,2),
  drift numeric(18,2),
  is_healthy boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_vestara_recon_findings_checked ON public.vestara_reconciliation_findings(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_vestara_recon_findings_unhealthy ON public.vestara_reconciliation_findings(is_healthy) WHERE is_healthy = false;

ALTER TABLE public.vestara_reconciliation_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view recon findings" ON public.vestara_reconciliation_findings;
CREATE POLICY "Admins view recon findings"
  ON public.vestara_reconciliation_findings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ─────────── Seed default products ───────────
INSERT INTO public.vestara_products
  (code, name, description, min_user_rate, max_user_rate, vfd_rate, min_tenor_days, max_tenor_days, early_withdrawal_penalty_pct, allow_early_withdrawal, is_upfront_yield)
VALUES
  ('goalsave',     'GoalSave',      'Flexible goal-based savings, 90 – 365 days.',         10.00, 16.00, 22.00, 90, 365, 30.00, true,  false),
  ('vault',        'Vault',         'Fixed deposit, 30 – 365 days.',                       14.00, 20.50, 24.00, 30, 365, 40.00, true,  false),
  ('lockmax',      'LockMax',       'High-yield long lock, 90 – 365 days.',                18.00, 21.00, 25.00, 90, 365, 50.00, true,  false),
  ('upfront_yield','Upfront Yield', 'Discounted upfront interest, no early withdrawal.',   12.00, 18.00, 22.00, 30, 365, 100.00,false, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- ATOMIC RPCs
-- ============================================================

-- Create a savings instance (handles both regular and upfront-yield products).
-- Atomically: validates product, picks rate, creates lock account, posts ledger
-- entries debiting wallet and crediting locked_savings, and (for upfront yield)
-- credits the discounted interest back to the wallet.
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
  -- Lock product config row to read latest rates
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

  -- Lock & read user's wallet
  SELECT id, balance INTO v_wallet_id, v_wallet_balance
    FROM public.vestara_accounts
   WHERE user_id = _user_id AND account_type = 'wallet' AND is_system = false
   FOR UPDATE;
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not provisioned for user' USING ERRCODE = 'P0001';
  END IF;

  -- Sum existing locked balances for this user
  SELECT COALESCE(SUM(balance),0) INTO v_locked_total
    FROM public.vestara_accounts
   WHERE user_id = _user_id AND account_type = 'locked_savings';

  v_available := v_wallet_balance - v_locked_total;
  IF _principal > v_available THEN
    RAISE EXCEPTION 'Insufficient available balance (available=%, requested=%)',
      v_available, _principal USING ERRCODE = 'P0001';
  END IF;

  -- Pick user rate proportional to tenor within range
  v_user_rate := v_product.min_user_rate +
    ( (v_product.max_user_rate - v_product.min_user_rate)
      * GREATEST(0, LEAST(1,
          (_tenor_days - v_product.min_tenor_days)::numeric
          / NULLIF(v_product.max_tenor_days - v_product.min_tenor_days, 0)
        ))
    );

  v_time_frac := _tenor_days::numeric / 365.0;
  v_maturity  := now() + (_tenor_days || ' days')::interval;

  -- Upfront yield: discount formula
  IF v_product.is_upfront_yield THEN
    v_discounted_interest :=
      ROUND( (_principal * (v_user_rate/100.0) * v_time_frac)
             / (1 + (v_user_rate/100.0) * v_time_frac), 2);
    v_effective_rate := ROUND(v_user_rate, 4);
  END IF;

  -- Create the lock_savings account for this savings instance
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

  -- Create transaction
  INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
  VALUES ('lock','completed', _reference, _principal, _user_id,
          jsonb_build_object('product', v_product.code, 'tenor_days', _tenor_days))
  RETURNING id INTO v_tx_id;

  -- Ledger: wallet debit, lock_savings credit
  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES (v_tx_id, v_wallet_id, _principal, 0),
         (v_tx_id, v_lock_account_id, 0, _principal);

  -- Persist the new balances
  UPDATE public.vestara_accounts SET balance = balance - _principal WHERE id = v_wallet_id;
  UPDATE public.vestara_accounts SET balance = balance + _principal WHERE id = v_lock_account_id;

  -- For upfront yield: credit discounted interest immediately to wallet
  IF v_product.is_upfront_yield AND v_discounted_interest > 0 THEN
    DECLARE v_int_tx uuid; v_sys_int_acct uuid;
    BEGIN
      -- system "accrued_interest_pool" account (treasury-side liability)
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

  -- Persist savings instance
  INSERT INTO public.vestara_savings
    (user_id, product_id, product_code, lock_account_id,
     principal, original_principal, user_rate, vfd_rate, tenor_days,
     start_date, maturity_date, discounted_interest_paid, effective_rate)
  VALUES
    (_user_id, v_product.id, v_product.code, v_lock_account_id,
     _principal, _principal, v_user_rate, v_product.vfd_rate, _tenor_days,
     now(), v_maturity, v_discounted_interest, v_effective_rate)
  RETURNING id INTO v_savings_id;

  -- Update treasury aggregate (locked total)
  UPDATE public.vestara_treasury
     SET total_locked_funds = total_locked_funds + _principal,
         total_invested_with_vfd = (total_locked_funds + _principal) * invest_ratio,
         liquidity_buffer       = (total_locked_funds + _principal) * (1 - invest_ratio),
         updated_at = now();

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

-- Mature a savings instance (called by cron or admin)
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

  -- Upfront yield: principal only (interest already paid)
  -- Others: principal + accrued_interest
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

  -- Unlock principal: debit lock_account, credit wallet
  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES (v_tx_id, v_s.lock_account_id, v_s.principal, 0),
         (v_tx_id, v_wallet_id, 0, v_s.principal);
  UPDATE public.vestara_accounts SET balance = balance - v_s.principal WHERE id = v_s.lock_account_id;
  UPDATE public.vestara_accounts SET balance = balance + v_s.principal WHERE id = v_wallet_id;

  -- Pay accrued interest from system accrued_interest pool to wallet
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
     SET total_locked_funds = GREATEST(0, total_locked_funds - v_s.principal),
         total_invested_with_vfd = GREATEST(0, total_locked_funds - v_s.principal) * invest_ratio,
         liquidity_buffer       = GREATEST(0, total_locked_funds - v_s.principal) * (1 - invest_ratio),
         updated_at = now();

  RETURN jsonb_build_object('success', true, 'savings_id', v_s.id, 'payout', v_total_payout);
END;
$$;

-- Early withdrawal
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

  -- Return principal
  INSERT INTO public.vestara_ledger_entries (transaction_id, account_id, debit, credit)
  VALUES (v_tx_id, v_s.lock_account_id, v_s.principal, 0),
         (v_tx_id, v_wallet_id, 0, v_s.principal);
  UPDATE public.vestara_accounts SET balance = balance - v_s.principal WHERE id = v_s.lock_account_id;
  UPDATE public.vestara_accounts SET balance = balance + v_s.principal WHERE id = v_wallet_id;

  -- Net interest payout (if any)
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
         updated_at = now();

  RETURN jsonb_build_object('success', true, 'payout', v_payout, 'penalty', v_penalty);
END;
$$;

-- Daily interest accrual: walks all active savings (excluding upfront_yield),
-- adds 1 day's interest to savings.accrued_interest and updates treasury totals.
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
         updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'accrued_count', v_count,
    'user_interest', v_total_user,
    'vfd_interest', v_total_vfd,
    'spread', v_total_vfd - v_total_user
  );
END;
$$;

-- Auto-mature any savings whose maturity_date has passed
CREATE OR REPLACE FUNCTION public.vestara_auto_mature_due()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.vestara_savings
     WHERE status = 'active' AND maturity_date <= now()
  LOOP
    PERFORM public.vestara_mature_savings(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'matured_count', v_count);
END;
$$;

-- Daily reconciliation: 3 checks
CREATE OR REPLACE FUNCTION public.vestara_run_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_wallet numeric;
  v_total_locked numeric;
  v_treasury_locked numeric;
  v_treasury_invested numeric;
  v_treasury_buffer numeric;
  v_check1_ok boolean;
  v_check2_ok boolean;
  v_check3_ok boolean;
  v_drift2 numeric;
BEGIN
  SELECT COALESCE(SUM(balance),0) INTO v_total_wallet
    FROM public.vestara_accounts WHERE account_type = 'wallet' AND is_system = false;
  SELECT COALESCE(SUM(balance),0) INTO v_total_locked
    FROM public.vestara_accounts WHERE account_type = 'locked_savings';
  SELECT total_locked_funds, total_invested_with_vfd, liquidity_buffer
    INTO v_treasury_locked, v_treasury_invested, v_treasury_buffer
    FROM public.vestara_treasury LIMIT 1;

  -- Check 1: invariant wallet >= locked (per-user already enforced by available logic;
  -- here we just record system-wide totals).
  v_check1_ok := v_total_wallet >= v_total_locked;

  -- Check 2: locked balances == treasury.total_locked_funds
  v_drift2 := ABS(v_total_locked - COALESCE(v_treasury_locked,0));
  v_check2_ok := v_drift2 < 0.01;

  -- Check 3: total_locked_funds <= invested + buffer
  v_check3_ok := COALESCE(v_treasury_locked,0)
              <= COALESCE(v_treasury_invested,0) + COALESCE(v_treasury_buffer,0) + 0.01;

  INSERT INTO public.vestara_reconciliation_findings (check_name, expected, actual, drift, is_healthy, details) VALUES
    ('wallet_gte_locked', v_total_locked, v_total_wallet, v_total_wallet - v_total_locked, v_check1_ok, '{}'::jsonb),
    ('locked_vs_treasury', v_treasury_locked, v_total_locked, v_drift2, v_check2_ok, '{}'::jsonb),
    ('liquidity_coverage', v_treasury_locked, v_treasury_invested + v_treasury_buffer,
       (v_treasury_invested + v_treasury_buffer) - v_treasury_locked, v_check3_ok, '{}'::jsonb);

  RETURN jsonb_build_object(
    'success', true,
    'healthy', v_check1_ok AND v_check2_ok AND v_check3_ok,
    'total_wallet', v_total_wallet,
    'total_locked', v_total_locked,
    'treasury_locked', v_treasury_locked,
    'treasury_invested', v_treasury_invested,
    'treasury_buffer', v_treasury_buffer
  );
END;
$$;