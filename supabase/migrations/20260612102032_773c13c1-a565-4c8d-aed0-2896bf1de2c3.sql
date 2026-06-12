-- Remove unused tables from Realtime publication to reduce broadcast surface.
-- These tables have no active postgres_changes subscription in the app.
-- (RLS on each remaining table strictly scopes events to auth.uid(), so postgres_changes
-- listeners on public channels only receive their own rows.)
ALTER PUBLICATION supabase_realtime DROP TABLE public.credit_score_history;
ALTER PUBLICATION supabase_realtime DROP TABLE public.ledger_entries;
ALTER PUBLICATION supabase_realtime DROP TABLE public.target_ajo_invites;
ALTER PUBLICATION supabase_realtime DROP TABLE public.target_ajo_memberships;
ALTER PUBLICATION supabase_realtime DROP TABLE public.vfd_sandbox_group_contributions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.vfd_sandbox_groups;
ALTER PUBLICATION supabase_realtime DROP TABLE public.vfd_sandbox_group_members;