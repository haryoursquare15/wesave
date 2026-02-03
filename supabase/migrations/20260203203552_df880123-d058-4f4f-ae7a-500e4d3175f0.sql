-- Fix duplicate key errors on group_wallets/group_memberships:
-- `handle_new_group` trigger already inserts the admin membership + group wallet.
-- So create_thrift_group must NOT insert them again.

CREATE OR REPLACE FUNCTION public.create_thrift_group(
  _name text,
  _max_members integer,
  _contribution_amount numeric,
  _period contribution_period,
  _auto_debit boolean,
  _contribution_hour integer DEFAULT 9,
  _contribution_minute integer DEFAULT 0,
  _contribution_day_of_week integer DEFAULT 1,
  _contribution_day_of_month integer DEFAULT 1
)
RETURNS thrift_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_group thrift_groups;
  invite_token text;
BEGIN
  invite_token := replace(public.gen_random_uuid()::text, '-', '');
  invite_token := substring(invite_token from 1 for 12);

  INSERT INTO public.thrift_groups (
    name,
    admin_id,
    max_members,
    contribution_amount,
    period,
    auto_debit,
    invite_code,
    contribution_hour,
    contribution_minute,
    contribution_day_of_week,
    contribution_day_of_month
  )
  VALUES (
    _name,
    auth.uid(),
    _max_members,
    _contribution_amount,
    _period,
    _auto_debit,
    invite_token,
    _contribution_hour,
    _contribution_minute,
    _contribution_day_of_week,
    _contribution_day_of_month
  )
  RETURNING * INTO new_group;

  -- NOTE: group_wallet + admin membership are created by trigger: on_thrift_group_created -> handle_new_group()

  PERFORM public.log_audit_event(
    auth.uid(),
    'group_created',
    'thrift_groups',
    new_group.id::text,
    json_build_object('name', _name, 'max_members', _max_members)::jsonb
  );

  RETURN new_group;
END;
$$;