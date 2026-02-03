-- Drop the old function without time parameters to resolve ambiguity
DROP FUNCTION IF EXISTS public.create_thrift_group(text, integer, numeric, contribution_period, boolean);

-- The updated function with time parameters already exists and will be used