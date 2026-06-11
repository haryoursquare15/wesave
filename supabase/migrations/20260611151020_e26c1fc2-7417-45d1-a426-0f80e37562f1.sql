
create table if not exists public.vfd_settings (
  key text primary key,
  value text not null,
  updated_at timestamp with time zone not null default now()
);

grant select on public.vfd_settings to authenticated;
grant all on public.vfd_settings to service_role;

alter table public.vfd_settings enable row level security;

drop policy if exists "Admins can read vfd settings" on public.vfd_settings;
create policy "Admins can read vfd settings"
on public.vfd_settings for select to authenticated
using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'super_admin'::app_role));
