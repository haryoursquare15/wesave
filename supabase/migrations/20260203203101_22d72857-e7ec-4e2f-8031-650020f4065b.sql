-- Ensure pgcrypto exists (your previous migration may have created it in `extensions`)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Create public wrappers so calls to gen_random_uuid()/gen_random_bytes() work even when pgcrypto lives in `extensions`
-- This fixes errors like: function gen_random_uuid does not exist
CREATE OR REPLACE FUNCTION public.gen_random_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT extensions.gen_random_uuid();
$$;

CREATE OR REPLACE FUNCTION public.gen_random_bytes(n integer)
RETURNS bytea
LANGUAGE sql
STABLE
AS $$
  SELECT extensions.gen_random_bytes(n);
$$;

-- Update create_thrift_group to use the public wrapper + include extensions in search_path for safety
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

  INSERT INTO thrift_groups (
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

  INSERT INTO group_memberships (group_id, user_id, payout_position, status)
  VALUES (new_group.id, auth.uid(), 1, 'active');

  INSERT INTO group_wallets (group_id, contribution_balance)
  VALUES (new_group.id, 0);

  PERFORM log_audit_event(
    auth.uid(),
    'group_created',
    'thrift_groups',
    new_group.id::text,
    json_build_object('name', _name, 'max_members', _max_members)::jsonb
  );

  RETURN new_group;
END;
$$;