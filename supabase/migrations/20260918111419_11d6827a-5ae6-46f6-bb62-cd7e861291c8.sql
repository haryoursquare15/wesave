CREATE OR REPLACE FUNCTION public.budget_set_rule(_period_type text, _limit_amount numeric, _reset_day integer DEFAULT NULL::integer, _unlock_mode text DEFAULT 'instant'::text, _cooling_off_minutes integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _user uuid := auth.uid();
  _cap numeric;
  r public.budget_rules%rowtype;
  w record;
begin
  if _user is null then raise exception 'Not authenticated'; end if;
  if _limit_amount is null or _limit_amount <= 0 then raise exception 'Enter an amount above zero'; end if;
  _cap := public.budget_kyc_cap(_user, _period_type);
  if _limit_amount > _cap then
    raise exception 'Your spending limit cannot be more than your account limit of %', to_char(_cap, 'FM999,999,999');
  end if;
  insert into public.budget_rules(user_id, period_type, limit_amount, reset_day, unlock_mode, cooling_off_minutes, status)
  values (_user, _period_type, _limit_amount, _reset_day, _unlock_mode, coalesce(_cooling_off_minutes, 30), 'active')
  on conflict (user_id) do update
    set period_type = excluded.period_type,
        limit_amount = excluded.limit_amount,
        reset_day = excluded.reset_day,
        unlock_mode = excluded.unlock_mode,
        cooling_off_minutes = excluded.cooling_off_minutes,
        status = 'active'
  returning * into r;

  -- Keep the live spending window in step with the new limit, otherwise the
  -- card keeps showing the old allowance until the window rolls over.
  select * into w from public.budget_period_window(r.period_type, r.reset_day);
  update public.budget_periods
     set limit_amount = r.limit_amount
   where rule_id = r.id
     and period_start = w.period_start;

  return public.budget_get_status();
end;
$function$;