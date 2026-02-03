-- Fix missing authorization in get_payout_order SECURITY DEFINER function
-- Add proper group membership/admin verification before returning data

CREATE OR REPLACE FUNCTION public.get_payout_order(target_group_id UUID)
RETURNS TABLE (
  payout_position INTEGER,
  member_user_id UUID,
  member_full_name TEXT,
  member_username TEXT,
  member_avatar_url TEXT,
  member_has_received_payout BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller is member or admin of the group
  IF NOT (is_group_member(target_group_id) OR is_group_admin(target_group_id)) THEN
    RAISE EXCEPTION 'Access denied: Not a member of this group';
  END IF;
  
  RETURN QUERY
  SELECT 
    gm.payout_position,
    gm.user_id as member_user_id,
    p.full_name as member_full_name,
    p.username as member_username,
    p.avatar_url as member_avatar_url,
    gm.has_received_payout as member_has_received_payout
  FROM public.group_memberships gm
  JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.group_id = target_group_id
  AND gm.status = 'active'
  ORDER BY gm.payout_position;
END;
$$;