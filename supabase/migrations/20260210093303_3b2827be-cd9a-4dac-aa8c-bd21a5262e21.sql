
-- Fix overly permissive service role policies by dropping them
-- Edge functions use service role key which bypasses RLS entirely, so these policies are unnecessary
DROP POLICY "Service role full access card_tokens" ON public.card_tokens;
DROP POLICY "Service role full access retries" ON public.contribution_retries;
