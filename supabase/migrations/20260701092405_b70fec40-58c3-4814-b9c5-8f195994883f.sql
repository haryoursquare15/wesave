DROP POLICY IF EXISTS "Admins view all savings" ON public.vestara_savings;
CREATE POLICY "Admins view all savings" ON public.vestara_savings
  FOR SELECT USING (public.is_any_admin(auth.uid()));