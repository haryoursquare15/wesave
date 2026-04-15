
-- Fix security definer view by making it SECURITY INVOKER
ALTER VIEW public.vestara_account_drift SET (security_invoker = on);
