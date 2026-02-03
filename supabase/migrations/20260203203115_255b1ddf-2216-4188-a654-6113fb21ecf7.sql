-- Fix linter WARN: set immutable search_path on the wrapper functions
CREATE OR REPLACE FUNCTION public.gen_random_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = extensions
AS $$
  SELECT extensions.gen_random_uuid();
$$;

CREATE OR REPLACE FUNCTION public.gen_random_bytes(n integer)
RETURNS bytea
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = extensions
AS $$
  SELECT extensions.gen_random_bytes(n);
$$;