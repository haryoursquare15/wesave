CREATE POLICY "Admins can view all ledger entries"
ON public.ledger_entries
FOR SELECT
USING (is_any_admin(auth.uid()));