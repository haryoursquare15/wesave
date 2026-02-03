-- Remove the duplicate trigger that inserts admin into group_memberships
-- (handle_new_group already does this via on_thrift_group_created trigger)
DROP TRIGGER IF EXISTS trigger_auto_add_admin_to_group ON public.thrift_groups;

-- Also drop the now-unused function
DROP FUNCTION IF EXISTS public.auto_add_admin_to_group();