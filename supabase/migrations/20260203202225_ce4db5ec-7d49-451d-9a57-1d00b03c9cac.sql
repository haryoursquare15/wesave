-- Enable pgcrypto extension for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Update the create_thrift_group function to use gen_random_uuid instead
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
SET search_path = public
AS $$
DECLARE
  new_group thrift_groups;
  invite_token text;
BEGIN
  -- Generate a unique invite code using substring of UUID (no extension needed)
  invite_token := replace(gen_random_uuid()::text, '-', '');
  invite_token := substring(invite_token from 1 for 12);
  
  -- Create the group
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
  
  -- Add the creator as the first member with position 1
  INSERT INTO group_memberships (group_id, user_id, payout_position, status)
  VALUES (new_group.id, auth.uid(), 1, 'active');
  
  -- Create group wallet
  INSERT INTO group_wallets (group_id, contribution_balance)
  VALUES (new_group.id, 0);
  
  -- Log the creation
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