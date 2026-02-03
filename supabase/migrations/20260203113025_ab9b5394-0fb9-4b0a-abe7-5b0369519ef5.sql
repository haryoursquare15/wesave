-- Create a security-definer RPC to create a thrift group reliably (avoids client-side RLS insert failures)

CREATE OR REPLACE FUNCTION public.create_thrift_group(
  _name text,
  _max_members integer,
  _contribution_amount numeric,
  _period public.contribution_period,
  _auto_debit boolean
)
RETURNS public.thrift_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _group public.thrift_groups;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.thrift_groups (
    name,
    max_members,
    contribution_amount,
    period,
    auto_debit,
    admin_id,
    status
  )
  VALUES (
    _name,
    COALESCE(_max_members, 5),
    _contribution_amount,
    COALESCE(_period, 'weekly'::public.contribution_period),
    COALESCE(_auto_debit, true),
    auth.uid(),
    'pending'::public.group_status
  )
  RETURNING * INTO _group;

  RETURN _group;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_thrift_group(text, integer, numeric, public.contribution_period, boolean) TO authenticated;