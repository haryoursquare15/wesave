ALTER TABLE public.vestara_savings DROP CONSTRAINT IF EXISTS vestara_savings_principal_check;
ALTER TABLE public.vestara_savings ADD CONSTRAINT vestara_savings_principal_check CHECK (principal >= 0);