create or replace function public.budget_spent_in_window(_user uuid, _from timestamptz, _to timestamptz)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(amount), 0)::numeric
  from public.vfd_sandbox_transactions
  where user_id = _user
    and status = 'completed'
    and created_at >= _from
    and created_at < _to
    and (
      transaction_type = 'transfer'
      or (
        transaction_type = 'debit'
        and (
          description ilike 'Bill Payment:%'
          or description ilike 'SplitPay (Bill):%'
        )
      )
    );
$$;