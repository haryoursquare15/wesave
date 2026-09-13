
create or replace function public.budget_kyc_cap(_user uuid, _period_type text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (case lower(coalesce((select c.tier from public.vfd_sandbox_clients c where c.user_id = _user limit 1), 'tier1'))
            when 'tier3' then 5000000
            when 'tier2' then 100000
            else 30000
          end)::numeric
       * (case _period_type when 'weekly' then 7 when 'monthly' then 30 else 1 end)::numeric
$$;

grant execute on function public.budget_kyc_cap(uuid, text) to authenticated;

create or replace function public.budget_set_rule(
  _period_type text,
  _limit_amount numeric,
  _reset_day integer default null,
  _unlock_mode text default 'instant',
  _cooling_off_minutes integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user uuid := auth.uid();
  _cap numeric;
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
        status = 'active';
  return public.budget_get_status();
end;
$$;

create or replace function public.budget_request_unlock(_amount numeric, _reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user uuid := auth.uid();
  r public.budget_rules%rowtype;
  _status jsonb;
  _period_id uuid;
  _cap numeric;
  _allowance numeric;
begin
  if _user is null then raise exception 'Not authenticated'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Enter an amount above zero'; end if;
  select * into r from public.budget_rules where user_id = _user;
  if not found then raise exception 'No spending limit set'; end if;
  _status := public.budget_get_status();
  _period_id := (_status->'period'->>'id')::uuid;
  _cap := public.budget_kyc_cap(_user, r.period_type);
  _allowance := coalesce((_status->'period'->>'limit_amount')::numeric, r.limit_amount)
              + coalesce((_status->>'unlocked_amount')::numeric, 0);
  if _allowance + _amount > _cap then
    raise exception 'That would take you past your account limit of %', to_char(_cap, 'FM999,999,999');
  end if;
  insert into public.budget_unlocks(period_id, user_id, amount, reason, cooling_off_expires_at, status)
  values (
    _period_id, _user, _amount, _reason,
    case when r.unlock_mode = 'cooling_off' then now() + make_interval(mins => r.cooling_off_minutes) else null end,
    case when r.unlock_mode = 'cooling_off' then 'pending' else 'confirmed' end
  );
  return public.budget_get_status();
end;
$$;

create or replace function public.budget_get_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user uuid := auth.uid();
  r public.budget_rules%rowtype;
  p public.budget_periods%rowtype;
  w record;
  _spent numeric;
  _unlocked numeric;
  _pending jsonb;
begin
  if _user is null then
    raise exception 'Not authenticated';
  end if;
  select * into r from public.budget_rules where user_id = _user;
  if not found then
    return jsonb_build_object(
      'active', false,
      'rule', null,
      'kyc_tier', lower(coalesce((select c.tier from public.vfd_sandbox_clients c where c.user_id = _user limit 1), 'tier1')),
      'kyc_cap_daily', public.budget_kyc_cap(_user, 'daily'),
      'kyc_cap_weekly', public.budget_kyc_cap(_user, 'weekly'),
      'kyc_cap_monthly', public.budget_kyc_cap(_user, 'monthly')
    );
  end if;

  select * into w from public.budget_period_window(r.period_type, r.reset_day);

  select * into p from public.budget_periods
   where rule_id = r.id and period_start = w.period_start;
  if not found then
    update public.budget_periods set status = 'closed'
      where rule_id = r.id and status = 'active' and period_end <= now();
    insert into public.budget_periods(rule_id, user_id, period_start, period_end, limit_amount)
      values (r.id, _user, w.period_start, w.period_end, r.limit_amount)
      on conflict (rule_id, period_start) do nothing;
    select * into p from public.budget_periods
     where rule_id = r.id and period_start = w.period_start;
  end if;

  update public.budget_unlocks
     set status = 'confirmed'
   where period_id = p.id and status = 'pending'
     and cooling_off_expires_at is not null and cooling_off_expires_at <= now();

  _spent := public.budget_spent_in_window(_user, p.period_start, p.period_end);
  select coalesce(sum(amount), 0) into _unlocked
    from public.budget_unlocks where period_id = p.id and status = 'confirmed';
  select coalesce(jsonb_agg(to_jsonb(u) order by u.created_at desc), '[]'::jsonb) into _pending
    from public.budget_unlocks u where u.period_id = p.id and u.status = 'pending';

  return jsonb_build_object(
    'active', r.status = 'active',
    'rule', to_jsonb(r),
    'period', to_jsonb(p),
    'spent_amount', _spent,
    'unlocked_amount', _unlocked,
    'disposable_remaining', greatest(p.limit_amount + _unlocked - _spent, 0),
    'pending_unlocks', _pending,
    'kyc_tier', lower(coalesce((select c.tier from public.vfd_sandbox_clients c where c.user_id = _user limit 1), 'tier1')),
    'kyc_cap_daily', public.budget_kyc_cap(_user, 'daily'),
    'kyc_cap_weekly', public.budget_kyc_cap(_user, 'weekly'),
    'kyc_cap_monthly', public.budget_kyc_cap(_user, 'monthly'),
    'kyc_cap', public.budget_kyc_cap(_user, r.period_type)
  );
end;
$$;
