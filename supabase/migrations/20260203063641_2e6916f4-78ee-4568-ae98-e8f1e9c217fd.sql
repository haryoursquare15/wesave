-- Fix security issue: webhook_events needs a proper RLS policy (service role only via edge functions)
CREATE POLICY "Service role only access"
ON public.webhook_events FOR ALL
USING (false);

-- Fix security issue: cycle_contributions needs proper insert policy
DROP POLICY IF EXISTS "System can insert contributions" ON public.cycle_contributions;

CREATE POLICY "Authenticated users can record their own contributions"
ON public.cycle_contributions FOR INSERT
WITH CHECK (user_id = auth.uid());