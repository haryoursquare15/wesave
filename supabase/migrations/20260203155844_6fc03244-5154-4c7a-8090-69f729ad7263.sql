-- Fix SQL injection vulnerability in search_users function
-- Escape special ILIKE characters (%, _, \) and add length validation

CREATE OR REPLACE FUNCTION public.search_users(search_term TEXT)
RETURNS TABLE (
  id UUID,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  membership_tier public.membership_tier,
  credit_score INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sanitized_term TEXT;
BEGIN
  -- Reject empty or overly long search terms
  IF search_term IS NULL OR length(trim(search_term)) < 2 THEN
    RETURN;
  END IF;
  
  IF length(search_term) > 50 THEN
    RETURN;
  END IF;
  
  -- Escape special ILIKE characters: %, _, and \
  sanitized_term := regexp_replace(trim(search_term), '[%_\\]', '\\\&', 'g');
  
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.membership_tier,
    p.credit_score
  FROM public.profiles p
  WHERE 
    p.id != auth.uid() AND
    (
      p.username ILIKE '%' || sanitized_term || '%' OR
      p.full_name ILIKE '%' || sanitized_term || '%'
    )
  LIMIT 10;
END;
$$;