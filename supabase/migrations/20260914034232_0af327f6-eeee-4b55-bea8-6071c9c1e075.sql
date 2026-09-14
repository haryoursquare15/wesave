create or replace function public.spendlock_get_insights(
  _start_date date default (current_date - 89),
  _end_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  range_start timestamptz;
  range_end timestamptz;
  range_days integer;
  range_weeks numeric;
  stats jsonb;
  bills jsonb;
  income jsonb;
  suggestions jsonb;
  history jsonb;
  frequent_transfers jsonb;
  frequent_bill_payments jsonb;
  investment_total numeric := 0;
  investment_count integer := 0;
  ajo_groups integer := 0;
  ajo_active integer := 0;
  ajo_contributed numeric := 0;
  airtime_total numeric := 0;
  airtime_count integer := 0;
  wallet_balance numeric := 0;
  last_wallet_activity timestamptz;
  idle_days integer := 0;
  overview text;
  advice jsonb := '[]'::jsonb;
begin
  if u is null then raise exception 'Not authenticated'; end if;
  if _start_date is null or _end_date is null or _start_date > _end_date then
    raise exception 'Choose a valid date range';
  end if;
  if (_end_date - _start_date) > 365 then
    raise exception 'Date range cannot be longer than one year';
  end if;

  range_start := _start_date::timestamptz;
  range_end := (_end_date + 1)::timestamptz;
  range_days := greatest((_end_date - _start_date) + 1, 1);
  range_weeks := greatest(range_days::numeric / 7, 1);

  perform public.spendlock_run_detection(u);

  select jsonb_build_object(
    'avg_weekly_spend', coalesce(round(sum(t.amount) / range_weeks, 2), 0),
    'spend_volatility', case
      when coalesce(stddev_pop(t.amount), 0) > coalesce(avg(t.amount), 0) * 0.75 then 'high'
      when coalesce(stddev_pop(t.amount), 0) > coalesce(avg(t.amount), 0) * 0.35 then 'medium'
      else 'low' end,
    'debit_count_90d', count(*),
    'debit_count', count(*),
    'range_days', range_days,
    'range_start', _start_date,
    'range_end', _end_date
  ) into stats
  from public.vfd_sandbox_transactions t
  where t.user_id = u and t.status = 'completed'
    and t.transaction_type in ('transfer','debit')
    and t.created_at >= range_start and t.created_at < range_end;

  select coalesce(jsonb_agg(to_jsonb(b) order by b.next_expected_date nulls last), '[]'::jsonb)
    into bills from public.detected_bills b
   where b.user_id = u and b.status <> 'dismissed';

  select coalesce(jsonb_agg(to_jsonb(i) order by i.confidence desc), '[]'::jsonb)
    into income from public.income_events i
   where i.user_id = u and coalesce(i.detected_at, now()) >= range_start and coalesce(i.detected_at, now()) < range_end;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
    into suggestions from public.budget_suggestions s
   where s.user_id = u and s.status = 'pending';

  select jsonb_build_object(
    'periods_closed', count(*) filter (where p.status = 'closed'),
    'weeks_over_limit', count(*) filter (where public.budget_spent_in_window(u, p.period_start, p.period_end) > p.limit_amount),
    'unlock_count', (select count(*) from public.budget_unlocks bu where bu.user_id = u and bu.status = 'confirmed' and bu.created_at >= range_start and bu.created_at < range_end)
  ) into history from public.budget_periods p
  where p.user_id = u and p.period_start < range_end and p.period_end >= range_start;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.transfer_count desc, x.total_amount desc), '[]'::jsonb)
    into frequent_transfers
  from (
    select coalesce(nullif(max(t.beneficiary_name), ''), nullif(max(t.beneficiary_account), ''), 'Bank recipient') as name,
           max(nullif(t.beneficiary_account, '')) as account,
           count(*)::integer as transfer_count, round(sum(t.amount), 2) as total_amount,
           max(t.created_at) as last_sent_at
      from public.vfd_sandbox_transactions t
     where t.user_id = u and t.status = 'completed' and t.transaction_type = 'transfer'
       and t.created_at >= range_start and t.created_at < range_end
     group by coalesce(nullif(t.beneficiary_account, ''), nullif(t.beneficiary_name, ''), t.id::text)
     order by count(*) desc, sum(t.amount) desc limit 5
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.payment_count desc, x.total_amount desc), '[]'::jsonb)
    into frequent_bill_payments
  from (
    select coalesce(nullif(max(r.biller_name), ''), nullif(max(r.payment_item_name), ''), 'Bill payment') as name,
           max(nullif(r.payment_item_name, '')) as item,
           count(*)::integer as payment_count,
           round(sum(r.amount + coalesce(r.convenience_fee, 0)), 2) as total_amount,
           max(coalesce(r.paid_at, r.created_at)) as last_paid_at
      from public.vfd_sandbox_bill_receipts r
     where r.user_id = u and r.status in ('paid','completed','successful','success')
       and coalesce(r.paid_at, r.created_at) >= range_start and coalesce(r.paid_at, r.created_at) < range_end
     group by coalesce(nullif(r.biller_id, ''), nullif(r.biller_name, ''), nullif(r.payment_item_name, ''), r.id::text)
     order by count(*) desc, sum(r.amount + coalesce(r.convenience_fee, 0)) desc limit 5
  ) x;

  select coalesce(sum(s.principal + coalesce(s.accrued_interest, 0)), 0), count(*)::integer
    into investment_total, investment_count from public.vestara_savings s
   where s.user_id = u and s.status = 'active' and s.approval_status = 'approved'
     and s.sub_account_transfer_ref is not null and s.subaccount_funded_at is not null;

  select count(*)::integer, count(*) filter (where g.status = 'active')::integer
    into ajo_groups, ajo_active
    from public.vfd_sandbox_group_members m join public.vfd_sandbox_groups g on g.id = m.group_id
   where m.user_id = u and m.status <> 'removed';

  select coalesce(sum(c.amount), 0) into ajo_contributed
    from public.vfd_sandbox_group_contributions c
   where c.user_id = u and c.status in ('completed','confirmed','paid')
     and c.created_at >= range_start and c.created_at < range_end;

  select coalesce(sum(r.amount + coalesce(r.convenience_fee, 0)), 0), count(*)::integer
    into airtime_total, airtime_count
    from public.vfd_sandbox_bill_receipts r
   where r.user_id = u and r.status in ('paid','completed','successful','success')
     and coalesce(r.paid_at, r.created_at) >= range_start and coalesce(r.paid_at, r.created_at) < range_end
     and lower(concat_ws(' ', r.category, r.biller_name, r.payment_item_name, r.delivery_type)) like any(array['%airtime%','%mobile topup%','%mobile top-up%']);

  select coalesce(b.available_balance, 0), b.updated_at into wallet_balance, last_wallet_activity
    from public.vfd_user_balances b where b.user_id = u;
  select greatest(0, extract(day from now() - coalesce(max(t.created_at), last_wallet_activity, now()))::integer)
    into idle_days from public.vfd_sandbox_transactions t
   where t.user_id = u and t.status = 'completed';

  if wallet_balance >= 100000 and idle_days >= 21 then
    advice := advice || jsonb_build_array(jsonb_build_object('type','idle_wallet','title','Let idle money work for you','message',format('%s has stayed in your wallet for about %s days. Consider Vault or LockMax to earn interest if you will not need it soon.', to_char(wallet_balance, 'FM₦999,999,999'), idle_days),'action','Explore savings','action_key','lock'));
  elsif wallet_balance > 0 and investment_count = 0 then
    advice := advice || jsonb_build_array(jsonb_build_object('type','savings','title','Turn your limit into growth','message','While SpendLock protects your spending limit, you could lock money you will not need soon in Vault or GoalSave and earn interest.','action','Explore savings','action_key','lock'));
  end if;

  if ajo_groups = 0 and wallet_balance >= 10000 then
    advice := advice || jsonb_build_array(jsonb_build_object('type','ajo','title','Grow with your circle','message','You have not joined an Ajo yet. A ₦10,000 weekly Ajo with five friends can build a ₦50,000 contribution cycle in five weeks.','action','Explore Ajo','action_key','ajo'));
  end if;

  if airtime_count >= 3 and airtime_total > 0 then
    advice := advice || jsonb_build_array(jsonb_build_object('type','airtime','title','Your airtime spend stands out','message',format('You spent %s on airtime across %s payments in this period. A dedicated spending limit can help you stay intentional.', to_char(airtime_total, 'FM₦999,999,999'), airtime_count),'action','Set a limit','action_key','spendlock'));
  end if;

  overview := case
    when jsonb_array_length(advice) > 0 then advice->0->>'message'
    when coalesce((stats->>'debit_count')::integer, 0) = 0 and investment_count = 0 and ajo_groups = 0 then 'Keep using Vestara for everyday payments and savings. Your personal overview will become more useful as your activity grows.'
    when coalesce(stats->>'spend_volatility', 'low') = 'high' then 'Your weekly spending changes often. Keep a buffer for bills and use SpendLock for everyday spending.'
    when investment_total > 0 and ajo_active > 0 then 'You are balancing personal savings with group contributions. Keep enough wallet balance for upcoming Ajo payments.'
    else 'Keep room for recurring bills, then move surplus money into a Vestara savings plan that matches when you will need it.' end;

  return jsonb_build_object(
    'stats', coalesce(stats, '{}'::jsonb), 'bills', bills, 'income', income,
    'suggestions', suggestions, 'budget_history', coalesce(history, '{}'::jsonb),
    'frequent_transfers', frequent_transfers, 'frequent_bill_payments', frequent_bill_payments,
    'investments', jsonb_build_object('total', investment_total, 'active_count', investment_count),
    'ajo', jsonb_build_object('groups_joined', ajo_groups, 'active_groups', ajo_active, 'total_contributed', ajo_contributed),
    'wallet', jsonb_build_object('available_balance', wallet_balance, 'idle_days', idle_days),
    'airtime', jsonb_build_object('total', airtime_total, 'payment_count', airtime_count),
    'advice', advice, 'overview', overview,
    'date_range', jsonb_build_object('start', _start_date, 'end', _end_date, 'days', range_days)
  );
end;
$$;

revoke all on function public.spendlock_get_insights(date, date) from public, anon;
grant execute on function public.spendlock_get_insights(date, date) to authenticated;