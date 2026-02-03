-- Update search_users function to also search by email (partial match)
-- Note: email is only used for matching, it's not returned to protect privacy
CREATE OR REPLACE FUNCTION public.search_users(search_term text)
RETURNS TABLE(
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  membership_tier public.membership_tier,
  credit_score integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    p.id != auth.uid() -- Exclude current user
    AND (
      p.username ILIKE '%' || search_term || '%'
      OR p.full_name ILIKE '%' || search_term || '%'
      OR p.email ILIKE '%' || search_term || '%'
    )
  ORDER BY 
    -- Prioritize exact matches
    CASE 
      WHEN p.username ILIKE search_term THEN 0
      WHEN p.email ILIKE search_term THEN 1
      WHEN p.full_name ILIKE search_term THEN 2
      ELSE 3
    END,
    p.full_name
  LIMIT 20;
END;
$$;