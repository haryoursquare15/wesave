DROP POLICY IF EXISTS "Authenticated can view flow health" ON public.flow_health;

CREATE POLICY "Admins can view flow health"
ON public.flow_health
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));