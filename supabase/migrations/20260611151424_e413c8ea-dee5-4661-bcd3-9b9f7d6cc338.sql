
-- 1. Append-only per-transaction state log
create table if not exists public.vfd_transaction_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid,
  user_id uuid,
  reference text,
  event_type text not null,
  actor text not null default 'system',
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_vfd_tx_events_tx on public.vfd_transaction_events(transaction_id);
create index if not exists idx_vfd_tx_events_ref on public.vfd_transaction_events(reference);
create index if not exists idx_vfd_tx_events_user on public.vfd_transaction_events(user_id, created_at desc);
create index if not exists idx_vfd_tx_events_type on public.vfd_transaction_events(event_type, created_at desc);

grant select on public.vfd_transaction_events to authenticated;
grant all on public.vfd_transaction_events to service_role;

alter table public.vfd_transaction_events enable row level security;

drop policy if exists "users read own tx events" on public.vfd_transaction_events;
create policy "users read own tx events"
on public.vfd_transaction_events for select to authenticated
using (user_id = auth.uid() or has_role(auth.uid(),'admin'::app_role) or has_role(auth.uid(),'super_admin'::app_role));

drop policy if exists "service role writes tx events" on public.vfd_transaction_events;
create policy "service role writes tx events"
on public.vfd_transaction_events for all
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 2. Balance drift findings (per-user VFD vs ledger mismatch)
create table if not exists public.vfd_balance_drift_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  vfd_account_number text,
  vfd_live_balance numeric(18,2) not null,
  recorded_balance numeric(18,2) not null,
  drift numeric(18,2) not null,
  threshold numeric(18,2) not null default 1,
  is_healthy boolean not null,
  details jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  resolved_at timestamp with time zone,
  checked_at timestamp with time zone not null default now()
);

create index if not exists idx_vfd_drift_user on public.vfd_balance_drift_findings(user_id, checked_at desc);
create index if not exists idx_vfd_drift_unhealthy on public.vfd_balance_drift_findings(is_healthy) where is_healthy = false;
create index if not exists idx_vfd_drift_checked on public.vfd_balance_drift_findings(checked_at desc);

grant select on public.vfd_balance_drift_findings to authenticated;
grant all on public.vfd_balance_drift_findings to service_role;

alter table public.vfd_balance_drift_findings enable row level security;

drop policy if exists "admins read drift findings" on public.vfd_balance_drift_findings;
create policy "admins read drift findings"
on public.vfd_balance_drift_findings for select to authenticated
using (has_role(auth.uid(),'admin'::app_role) or has_role(auth.uid(),'super_admin'::app_role));

drop policy if exists "service role writes drift findings" on public.vfd_balance_drift_findings;
create policy "service role writes drift findings"
on public.vfd_balance_drift_findings for all
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
