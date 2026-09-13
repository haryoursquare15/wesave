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
  frequent_transfers jsonb;
  frequent_bill_payments jsonb;
  investment_total numeric := 0;
  investment_count integer := 0;
  ajo_groups integer := 0;
  ajo_active integer := 0;
  ajo_contributed numeric := 0;
  overview text;
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

  select coalesce(jsonb_agg(to_jsonb(x) order by x.transfer_count desc, x.total_amount desc), '[]'::jsonb)
    into frequent_transfers
  from (
    select coalesce(nullif(max(t.beneficiary_name), ''), nullif(t.beneficiary_account, ''), 'Bank recipient') as name,
           max(nullif(t.beneficiary_account, '')) as account,
           count(*)::integer as transfer_count,
           round(sum(t.amount), 2) as total_amount,
           max(t.created_at) as last_sent_at
      from public.vfd_sandbox_transactions t
     where t.user_id = u and t.status = 'completed' and t.transaction_type = 'transfer'
       and t.created_at >= now() - interval '90 days'
     group by coalesce(nullif(t.beneficiary_account, ''), nullif(t.beneficiary_name, ''), t.id::text)
     order by count(*) desc, sum(t.amount) desc
     limit 5
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.payment_count desc, x.total_amount desc), '[]'::jsonb)
    into frequent_bill_payments
  from (
    select coalesce(nullif(r.biller_name, ''), nullif(r.payment_item_name, ''), 'Bill payment') as name,
           max(nullif(r.payment_item_name, '')) as item,
           count(*)::integer as payment_count,
           round(sum(r.amount + coalesce(r.convenience_fee, 0)), 2) as total_amount,
           max(coalesce(r.paid_at, r.created_at)) as last_paid_at
      from public.vfd_sandbox_bill_receipts r
     where r.user_id = u and r.status in ('paid','completed','successful','success')
       and coalesce(r.paid_at, r.created_at) >= now() - interval '90 days'
     group by coalesce(nullif(r.biller_id, ''), nullif(r.biller_name, ''), nullif(r.payment_item_name, ''), r.id::text)
     order by count(*) desc, sum(r.amount + coalesce(r.convenience_fee, 0)) desc
     limit 5
  ) x;

  select coalesce(sum(s.principal), 0), count(*)::integer
    into investment_total, investment_count
    from public.vestara_savings s
   where s.user_id = u and s.status = 'active'
     and s.approval_status = 'approved'
     and s.sub_account_transfer_ref is not null
     and s.subaccount_funded_at is not null;

  select count(*)::integer,
         count(*) filter (where g.status = 'active')::integer
    into ajo_groups, ajo_active
    from public.vfd_sandbox_group_members m
    join public.vfd_sandbox_groups g on g.id = m.group_id
   where m.user_id = u and m.status <> 'removed';

  select coalesce(sum(c.amount), 0)
    into ajo_contributed
    from public.vfd_sandbox_group_contributions c
   where c.user_id = u and c.status in ('completed','confirmed','paid');

  overview := case
    when coalesce((stats->>'debit_count_90d')::integer, 0) = 0 and investment_count = 0 and ajo_groups = 0
      then 'Keep using Vestara for everyday payments and savings. Your personal overview will become more useful as your activity grows.'
    when coalesce((stats->>'spend_volatility'), 'low') = 'high'
      then 'Your weekly spending changes often. Keep a buffer for bills, use SpendLock for everyday spending, and avoid committing money needed before payday.'
    when investment_total > 0 and ajo_active > 0
      then 'You are balancing personal savings with group contributions. Keep enough wallet balance for upcoming Ajo payments before increasing your investment commitments.'
    when investment_total > 0
      then 'Your savings are building. Keep upcoming bills and transfers within your available SpendLock amount before adding to an investment.'
    when ajo_active > 0
      then 'You have active Ajo commitments. Keep your wallet funded ahead of collection dates and leave room for regular bills.'
    else 'Your spending pattern is becoming clearer. Set a realistic SpendLock amount, keep room for recurring bills, and move surplus money into savings.'
  end;

  return jsonb_build_object(
    'stats', stats,
    'bills', bills,
    'income', income,
    'suggestions', suggestions,
    'budget_history', coalesce(history, '{}'::jsonb),
    'frequent_transfers', frequent_transfers,
    'frequent_bill_payments', frequent_bill_payments,
    'investments', jsonb_build_object('total', investment_total, 'active_count', investment_count),
    'ajo', jsonb_build_object('groups_joined', ajo_groups, 'active_groups', ajo_active, 'total_contributed', ajo_contributed),
    'overview', overview
  );
end;
$$;

revoke all on function public.spendlock_get_insights() from public, anon;
grant execute on function public.spendlock_get_insights() to authenticated;