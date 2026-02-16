
-- Tighten the INSERT policy to only allow admin inserts (service role bypasses RLS anyway)
DROP POLICY IF EXISTS "Service role can insert platform expenses" ON public.platform_expenses;

-- No public INSERT policy needed - service role (used by edge functions) bypasses RLS
-- This removes the WITH CHECK (true) linter warning
