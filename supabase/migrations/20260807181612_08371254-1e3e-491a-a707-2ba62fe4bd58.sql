-- Own-row only: the previous admin branch combined with LIMIT 1 could return an
-- arbitrary member's mandate. Admin/support access goes through backend
-- functions, which use the service role.
CREATE OR REPLACE FUNCTION public.get_own_group_mandate(_group_id uuid)
RETURNS TABLE (
  mandate_status text, mandate_reference text, mandate_code text,
  mandate_nibss_account text, mandate_nibss_message text,
  mandate_payer_bank_code text, mandate_payer_account_number text,
  mandate_payer_phone text, mandate_payer_email text, mandate_payer_address text,
  mandate_start_date date, mandate_end_date date, mandate_frequency text,
  mandate_authorized_at timestamptz, mandate_expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.mandate_status, m.mandate_reference, m.mandate_code,
         m.mandate_nibss_account, m.mandate_nibss_message,
         m.mandate_payer_bank_code, m.mandate_payer_account_number,
         m.mandate_payer_phone, m.mandate_payer_email, m.mandate_payer_address,
         m.mandate_start_date, m.mandate_end_date, m.mandate_frequency,
         m.mandate_authorized_at, m.mandate_expires_at
  FROM public.vfd_sandbox_group_members m
  WHERE m.group_id = _group_id
    AND auth.uid() IS NOT NULL
    AND m.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_own_group_mandate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_group_mandate(uuid) TO authenticated;