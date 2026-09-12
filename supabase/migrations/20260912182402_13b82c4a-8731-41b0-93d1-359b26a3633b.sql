
create table public.budget_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('daily','weekly','monthly')),
  limit_amount numeric(14,2) not null check (limit_amount > 0),
  reset_day int,
  unlock_mode text not null default 'instant' check (unlock_mode in ('instant','cooling_off')),
  cooling_off_minutes int not null default 30 check (cooling_off_minutes between 5 and 1440),
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index budget_rules_one_per_user on public.budget_rules(user_id);

create table public.budget_periods (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.budget_rules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  limit_amount numeric(14,2) not null,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now()
);
create unique index budget_periods_unique on public.budget_periods(rule_id, period_start);
create index budget_periods_user_idx on public.budget_periods(user_id, period_start desc);

create table public.budget_unlocks (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.budget_periods(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  reason text,
  cooling_off_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);
create index budget_unlocks_period_idx on public.budget_unlocks(period_id, status);

grant select, insert, update, delete on public.budget_rules to authenticated;
grant select, insert, update, delete on public.budget_periods to authenticated;
grant select, insert, update, delete on public.budget_unlocks to authenticated;
grant all on public.budget_rules to service_role;
grant all on public.budget_periods to service_role;
grant all on public.budget_unlocks to service_role;

alter table public.budget_rules enable row level security;
alter table public.budget_periods enable row level security;
alter table public.budget_unlocks enable row level security;

create policy "own budget rules" on public.budget_rules for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins view budget rules" on public.budget_rules for select to authenticated
  using (public.is_any_admin());

create policy "own budget periods" on public.budget_periods for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins view budget periods" on public.budget_periods for select to authenticated
  using (public.is_any_admin());

create policy "own budget unlocks" on public.budget_unlocks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins view budget unlocks" on public.budget_unlocks for select to authenticated
  using (public.is_any_admin());

create trigger budget_rules_touch before update on public.budget_rules
  for each row execute function public.update_updated_at_column();

-- Period window for "now" in West Africa Time, returned as UTC timestamps.
create or replace function public.budget_period_window(_period_type text, _reset_day int)
returns table(period_start timestamptz, period_end timestamptz)
language plpgsql stable set search_path = public as $$
declare
  local_now timestamp := (now() at time zone 'Africa/Lagos');
  s timestamp;
  e timestamp;
  dow int;
  target_dow int;
  anchor int;
begin
  if _period_type = 'daily' then
    s := date_trunc('day', local_now);
    e := s + interval '1 day';
  elsif _period_type = 'weekly' then
    target_dow := coalesce(nullif(_reset_day, 0), 1);
    dow := extract(isodow from local_now)::int;
    s := date_trunc('day', local_now) - make_interval(days => ((dow - target_dow + 7) % 7));
    e := s + interval '7 days';
  else
    anchor := least(greatest(coalesce(_reset_day, 1), 1), 28);
    s := date_trunc('month', local_now) + make_interval(days => anchor - 1);
    if local_now < s then
      s := s - interval '1 month';
    end if;
    e := s + interval '1 month';
  end if;
  return query select (s at time zone 'Africa/Lagos'), (e at time zone 'Africa/Lagos');
end;
$$;

-- Spending that counts against a SpendLock: completed outgoing transfers and
-- bill payments from the customer's own wallet in the window.
create or replace function public.budget_spent_in_window(_user uuid, _from timestamptz, _to timestamptz)
returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(amount), 0)::numeric
  from public.vfd_sandbox_transactions
  where user_id = _user
    and status = 'completed'
    and transaction_type in ('transfer','debit')
    and created_at >= _from and created_at < _to;
$$;

create or replace function public.budget_get_status()
returns jsonb language plpgsql security definer set search_path = public as $$
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
    return jsonb_build_object('active', false, 'rule', null);
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

  -- Expired cooling-off requests become available.
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
    'pending_unlocks', _pending
  );
end;
$$;

create or replace function public.budget_set_rule(
  _period_type text, _limit_amount numeric, _reset_day int default null,
  _unlock_mode text default 'instant', _cooling_off_minutes int default 30
) returns jsonb language plpgsql security definer set search_path = public as $$
declare _user uuid := auth.uid();
begin
  if _user is null then raise exception 'Not authenticated'; end if;
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

create or replace function public.budget_set_status(_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _user uuid := auth.uid();
begin
  if _user is null then raise exception 'Not authenticated'; end if;
  if _status not in ('active','paused') then raise exception 'Invalid status'; end if;
  update public.budget_rules set status = _status where user_id = _user;
  return public.budget_get_status();
end;
$$;

create or replace function public.budget_delete_rule()
returns jsonb language plpgsql security definer set search_path = public as $$
declare _user uuid := auth.uid();
begin
  if _user is null then raise exception 'Not authenticated'; end if;
  delete from public.budget_rules where user_id = _user;
  return jsonb_build_object('active', false, 'rule', null);
end;
$$;

create or replace function public.budget_request_unlock(_amount numeric, _reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _user uuid := auth.uid();
  r public.budget_rules%rowtype;
  _status jsonb;
  _period_id uuid;
begin
  if _user is null then raise exception 'Not authenticated'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Enter an amount above zero'; end if;
  select * into r from public.budget_rules where user_id = _user;
  if not found then raise exception 'No spending limit set'; end if;
  _status := public.budget_get_status();
  _period_id := (_status->'period'->>'id')::uuid;
  insert into public.budget_unlocks(period_id, user_id, amount, reason, cooling_off_expires_at, status)
  values (
    _period_id, _user, _amount, _reason,
    case when r.unlock_mode = 'cooling_off' then now() + make_interval(mins => r.cooling_off_minutes) else null end,
    case when r.unlock_mode = 'cooling_off' then 'pending' else 'confirmed' end
  );
  return public.budget_get_status();
end;
$$;

create or replace function public.budget_cancel_unlock(_unlock_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _user uuid := auth.uid();
begin
  if _user is null then raise exception 'Not authenticated'; end if;
  update public.budget_unlocks set status = 'cancelled'
   where id = _unlock_id and user_id = _user and status = 'pending';
  return public.budget_get_status();
end;
$$;

grant execute on function public.budget_get_status() to authenticated;
grant execute on function public.budget_set_rule(text, numeric, int, text, int) to authenticated;
grant execute on function public.budget_set_status(text) to authenticated;
grant execute on function public.budget_delete_rule() to authenticated;
grant execute on function public.budget_request_unlock(numeric, text) to authenticated;
grant execute on function public.budget_cancel_unlock(uuid) to authenticated;
