
-- 1) Drop unused beneficiary bank fields from target_ajo_groups
ALTER TABLE public.target_ajo_groups
  DROP COLUMN IF EXISTS beneficiary_account_number,
  DROP COLUMN IF EXISTS beneficiary_account_name,
  DROP COLUMN IF EXISTS beneficiary_bank_name;

-- 2) Restrict profiles admin SELECT to high-privilege roles only (exclude support_officer)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'compliance_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance_admin'::public.app_role)
  );
