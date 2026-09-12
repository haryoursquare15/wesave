-- SpendLock AI analytics layer (read-only insights)

create table if not exists public.detected_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  counterparty_hint text,
  amount_estimate numeric(14,2),
  cadence text,
  next_expected_date date,
  confidence numeric(3,2),
  occurrences int default 0,
  last_seen_at timestamptz,
  status text not null default 'suggested' check (status in ('suggested','confirmed','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, counterparty_hint)
);

create table if not exists public.income_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2),
  detected_at timestamptz,
  cadence text,
  confidence numeric(3,2),
  occurrences int default 0,
  created_at timestamptz not null default now(),
  unique (user_id, amount)
);

create table if not exists public.budget_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  suggestion_type text not null check (suggestion_type in ('set_limit','adjust_limit','pay_bill_reminder','category_insight')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.detected_bills to authenticated;
grant all on public.detected_bills to service_role;
grant select, insert, update, delete on public.income_events to authenticated;
grant all on public.income_events to service_role;
grant select, insert, update, delete on public.budget_suggestions to authenticated;
grant all on public.budget_suggestions to service_role;

alter table public.detected_bills enable row level security;
alter table public.income_events enable row level security;
alter table public.budget_suggestions enable row level security;

create policy "own detected bills" on public.detected_bills for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own income events" on public.income_events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own budget suggestions" on public.budget_suggestions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Layer 1: deterministic detection over the user's own transaction history.
create or replace function public.spendlock_run_detection(_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := coalesce(_user, auth.uid());
  stats jsonb;
  weeks numeric;
begin
  if u is null then
    raise exception 'Not authenticated';
  end if;
  if _user is not null and auth.uid() is not null and _user <> auth.uid()
     and not public.is_any_admin() then
    raise exception 'Not allowed';
  end if;

  -- Recurring debits -> candidate bills
  with debits as (
    select lower(trim(coalesce(nullif(beneficiary_name,''), nullif(description,''), 'Unknown'))) as party,
           amount, created_at
      from public.vfd_sandbox_transactions
     where user_id = u
       and status = 'completed'
       and transaction_type in ('transfer','debit')
       and created_at >= now() - interval '180 days'
  ),
  grouped as (
    select party,
           count(*) as n,
           round(avg(amount), 2) as avg_amount,
           max(created_at) as last_seen,
           (extract(epoch from (max(created_at) - min(created_at))) / 86400.0)
             / greatest(count(*) - 1, 1) as avg_gap_days
      from debits
     where party <> 'unknown'
     group by party
    having count(*) >= 2
       and stddev_pop(amount) <= greatest(avg(amount) * 0.20, 200)
  )
  insert into public.detected_bills as b
    (user_id, label, counterparty_hint, amount_estimate, cadence, next_expected_date, confidence, occurrences, last_seen_at)
  select u,
         initcap(party),
         party,
         avg_amount,
         case when avg_gap_days <= 10 then 'weekly'
              when avg_gap_days between 24 and 35 then 'monthly'
              else 'irregular' end,
         (last_seen + make_interval(days => greatest(round(avg_gap_days)::int, 1)))::date,
         least(0.95, 0.40 + 0.15 * n)::numeric(3,2),
         n,
         last_seen
    from grouped
  on conflict (user_id, counterparty_hint) do update
     set amount_estimate = excluded.amount_estimate,
         cadence = excluded.cadence,
         next_expected_date = excluded.next_expected_date,
         confidence = excluded.confidence,
         occurrences = excluded.occurrences,
         last_seen_at = excluded.last_seen_at,
         updated_at = now()
   where b.status <> 'dismissed';

  -- Periodic credits -> candidate income
  with credits as (
    select round(amount / 1000.0) * 1000 as band, amount, created_at
      from public.vfd_sandbox_transactions
     where user_id = u
       and status = 'completed'
       and transaction_type in ('credit','deposit','funding')
       and created_at >= now() - interval '180 days'
       and amount >= 10000
  ),
  grouped as (
    select band, count(*) n, round(avg(amount),2) avg_amount, max(created_at) last_seen,
           (extract(epoch from (max(created_at) - min(created_at))) / 86400.0)
             / greatest(count(*) - 1, 1) as avg_gap_days
      from credits group by band having count(*) >= 2
  )
  insert into public.income_events as i (user_id, amount, detected_at, cadence, confidence, occurrences)
  select u, avg_amount, last_seen,
         case when avg_gap_days between 12 and 17 then 'biweekly'
              when avg_gap_days between 24 and 35 then 'monthly'
              else 'irregular' end,
         least(0.95, 0.40 + 0.15 * n)::numeric(3,2),
         n
    from grouped
  on conflict (user_id, amount) do update
     set detected_at = excluded.detected_at,
         cadence = excluded.cadence,
         confidence = excluded.confidence,
         occurrences = excluded.occurrences;

  -- Aggregate stats (numbers only, no narrations)
  select jsonb_build_object(
    'avg_weekly_spend', coalesce(round(sum(amount) / nullif(weeks_count, 0), 2), 0),
    'spend_volatility', case
        when coalesce(stddev_pop(amount), 0) > coalesce(avg(amount), 0) * 0.75 then 'high'
        when coalesce(stddev_pop(amount), 0) > coalesce(avg(amount), 0) * 0.35 then 'medium'
        else 'low' end,
    'debit_count_90d', count(*)
  ) into stats
  from (
    select amount, 12.85::numeric as weeks_count
      from public.vfd_sandbox_transactions
     where user_id = u and status = 'completed'
       and transaction_type in ('transfer','debit')
       and created_at >= now() - interval '90 days'
  ) s, lateral (select 1) z
  group by weeks_count;

  return coalesce(stats, jsonb_build_object('avg_weekly_spend', 0, 'spend_volatility', 'low', 'debit_count_90d', 0));
end;
$$;

-- Read model for the app: runs detection then returns insights.
create or replace function public.spendlock_get_insights()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  stats jsonb;
  bills jsonb;
  income jsonb;
  suggestions jsonb;
  history jsonb;
begin
  if u is null then raise exception 'Not authenticated'; end if;
  stats := public.spendlock_run_detection(u);

  select coalesce(jsonb_agg(to_jsonb(b) order by b.next_expected_date nulls last), '[]'::jsonb)
    into bills
    from public.detected_bills b
   where b.user_id = u and b.status <> 'dismissed';

  select coalesce(jsonb_agg(to_jsonb(i) order by i.confidence desc), '[]'::jsonb)
    into income from public.income_events i where i.user_id = u;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
    into suggestions from public.budget_suggestions s
   where s.user_id = u and s.status = 'pending';

  select jsonb_build_object(
    'periods_closed', count(*) filter (where p.status = 'closed'),
    'weeks_over_limit', count(*) filter (
      where public.budget_spent_in_window(u, p.period_start, p.period_end) > p.limit_amount),
    'unlock_count', (select count(*) from public.budget_unlocks bu
                      where bu.user_id = u and bu.status = 'confirmed')
  ) into history
  from public.budget_periods p where p.user_id = u;

  return jsonb_build_object(
    'stats', stats,
    'bills', bills,
    'income', income,
    'suggestions', suggestions,
    'budget_history', coalesce(history, '{}'::jsonb)
  );
end;
$$;

create or replace function public.spendlock_update_bill(_bill_id uuid, _status text default null, _label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Not authenticated'; end if;
  if _status is not null and _status not in ('suggested','confirmed','dismissed') then
    raise exception 'Invalid status';
  end if;
  update public.detected_bills
     set status = coalesce(_status, status),
         label = coalesce(nullif(_label, ''), label),
         updated_at = now()
   where id = _bill_id and user_id = u;
  return public.spendlock_get_insights();
end;
$$;

create or replace function public.spendlock_resolve_suggestion(_suggestion_id uuid, _status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Not authenticated'; end if;
  if _status not in ('accepted','dismissed') then raise exception 'Invalid status'; end if;
  update public.budget_suggestions set status = _status
   where id = _suggestion_id and user_id = u and status = 'pending';
  return public.spendlock_get_insights();
end;
$$;

grant execute on function public.spendlock_run_detection(uuid) to authenticated, service_role;
grant execute on function public.spendlock_get_insights() to authenticated;
grant execute on function public.spendlock_update_bill(uuid, text, text) to authenticated;
grant execute on function public.spendlock_resolve_suggestion(uuid, text) to authenticated;