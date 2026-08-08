ALTER TABLE public.vestara_savings
  ADD COLUMN IF NOT EXISTS last_accrued_on date;

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
  -- Single-flight guard: fixed advisory key, released at transaction end.
  IF NOT pg_try_advisory_xact_lock(8123456789012345) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_running');
  END IF;

  FOR r IN
    SELECT id, principal, user_rate, vfd_rate, product_code
      FROM public.vestara_savings
     WHERE status = 'active'
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

  RETURN jsonb_build_object(
    'success', true,
    'accrued_count', v_count,
    'user_interest', v_total_user,
    'vfd_interest', v_total_vfd,
    'spread', v_total_vfd - v_total_user,
    'accrual_date', CURRENT_DATE
  );
END;
$function$;