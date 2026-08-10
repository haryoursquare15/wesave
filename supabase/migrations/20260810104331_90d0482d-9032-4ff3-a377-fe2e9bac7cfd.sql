CREATE OR REPLACE FUNCTION public.vestara_early_withdraw_savings(_user_id uuid, _savings_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_s public.vestara_savings%ROWTYPE;
  v_p public.vestara_products%ROWTYPE;
  v_wallet_id uuid;
  v_sys_int_acct uuid;
  v_tx_id uuid;
  v_penalty numeric;
  v_penalty_pct numeric;
  v_elapsed numeric;
  v_min_pct numeric := 10;
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

  v_penalty_pct := v_p.early_withdrawal_penalty_pct;

  -- LockMax: time-weighted forfeit. The earlier the exit, the larger the share
  -- of accrued interest forfeited; it decays linearly to a floor near maturity.
  --   elapsed     = (now - start) / (maturity - start), clamped to [0,1]
  --   penalty_pct = floor + (base - floor) * (1 - elapsed)
  IF v_p.code = 'lockmax' THEN
    IF v_s.maturity_date > v_s.start_date THEN
      v_elapsed := LEAST(1, GREATEST(0,
        EXTRACT(EPOCH FROM (now() - v_s.start_date::timestamptz))
        / NULLIF(EXTRACT(EPOCH FROM (v_s.maturity_date::timestamptz - v_s.start_date::timestamptz)), 0)
      ));
    ELSE
      v_elapsed := 0;
    END IF;
    v_min_pct := LEAST(v_min_pct, v_p.early_withdrawal_penalty_pct);
    v_penalty_pct := ROUND(v_min_pct + (v_p.early_withdrawal_penalty_pct - v_min_pct) * (1 - v_elapsed), 4);
  END IF;

  v_penalty := ROUND(v_s.accrued_interest * (v_penalty_pct / 100.0), 2);
  v_net_interest := GREATEST(0, v_s.accrued_interest - v_penalty);
  v_payout := v_s.principal + v_net_interest;

  SELECT id INTO v_wallet_id FROM public.vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' AND is_system = false FOR UPDATE;

  INSERT INTO public.vestara_transactions (type, status, reference, amount, initiated_by, metadata)
  VALUES ('unlock','completed', 'ewd-' || v_s.id, v_payout, _user_id,
          jsonb_build_object('kind','early_withdrawal','penalty', v_penalty,
                             'penalty_pct', v_penalty_pct, 'elapsed_fraction', v_elapsed))
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

  RETURN jsonb_build_object('success', true, 'payout', v_payout, 'penalty', v_penalty, 'penalty_pct', v_penalty_pct);
END;
$function$;