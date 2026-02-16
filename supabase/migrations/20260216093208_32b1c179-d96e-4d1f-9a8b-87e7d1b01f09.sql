
-- Allow admins to view all card tokens
CREATE POLICY "Admins can view all card tokens"
ON public.card_tokens
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'super_admin')
  )
);
