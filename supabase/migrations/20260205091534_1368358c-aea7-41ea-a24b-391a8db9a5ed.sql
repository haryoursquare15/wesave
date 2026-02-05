-- Fix the permissive INSERT policy on admin_requests
DROP POLICY IF EXISTS "Admins can insert requests" ON public.admin_requests;

CREATE POLICY "System and users can create requests"
  ON public.admin_requests FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_any_admin(auth.uid()));