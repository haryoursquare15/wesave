CREATE OR REPLACE FUNCTION public.vestara_savings_payout_preview(_savings_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_s public.vestara_savings%ROWTYPE;
  v_p public.vestara_products%ROWTYPE;
  v_penalty numeric := 0;
  v_penalty_pct numeric := 0;
  v_elapsed numeric := 0;
  v_min_pct numeric := 10;
  v_interest numeric := 0;
  v_net_interest numeric := 0;
BEGIN
  SELECT * INTO v_s FROM public.vestara_savings WHERE id = _savings_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Savings not found'); END IF;
  SELECT * INTO v_p FROM public.vestara_products WHERE id = v_s.product_id;

  IF v_s.product_code = 'upfront_yield' THEN
    v_interest := 0;
  ELSE
    v_interest := COALESCE(v_s.accrued_interest, 0);
  END IF;

  v_penalty_pct := COALESCE(v_p.early_withdrawal_penalty_pct, 0);
  IF v_p.code = 'lockmax' THEN
    IF v_s.maturity_date > v_s.start_date THEN
      v_elapsed := LEAST(1, GREATEST(0,
        EXTRACT(EPOCH FROM (now() - v_s.start_date::timestamptz))
        / NULLIF(EXTRACT(EPOCH FROM (v_s.maturity_date::timestamptz - v_s.start_date::timestamptz)), 0)
      ));
    ELSE
      v_elapsed := 0;
    END IF;
    v_min_pct := LEAST(v_min_pct, COALESCE(v_p.early_withdrawal_penalty_pct, 0));
    v_penalty_pct := ROUND(v_min_pct + (COALESCE(v_p.early_withdrawal_penalty_pct,0) - v_min_pct) * (1 - v_elapsed), 4);
  END IF;

  v_penalty := ROUND(COALESCE(v_s.accrued_interest,0) * (v_penalty_pct / 100.0), 2);
  v_net_interest := GREATEST(0, COALESCE(v_s.accrued_interest,0) - v_penalty);

  RETURN jsonb_build_object(
    'success', true,
    'savings_id', v_s.id,
    'user_id', v_s.user_id,
    'product_code', v_s.product_code,
    'status', v_s.status,
    'principal', COALESCE(v_s.principal,0),
    'maturity_payout', COALESCE(v_s.principal,0) + v_interest,
    'maturity_interest', v_interest,
    'early_payout', COALESCE(v_s.principal,0) + v_net_interest,
    'early_interest', v_net_interest,
    'penalty', v_penalty,
    'penalty_pct', v_penalty_pct,
    'elapsed_fraction', v_elapsed
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vestara_savings_payout_preview(uuid) TO authenticated, service_role;