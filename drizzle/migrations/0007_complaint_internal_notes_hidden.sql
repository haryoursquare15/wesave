DROP POLICY IF EXISTS "Users read own complaint events" ON public.complaint_events;
CREATE POLICY "Users read own complaint events" ON public.complaint_events FOR SELECT TO authenticated
  USING (event_type <> 'internal_note' AND EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.user_id = auth.uid()));