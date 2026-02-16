
-- Enforce max 2 active group memberships per user via trigger
CREATE OR REPLACE FUNCTION public.enforce_group_membership_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INTEGER;
BEGIN
  -- Only check on insert or when status changes to 'active'
  IF (TG_OP = 'INSERT' AND NEW.status = 'active') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'active' AND OLD.status != 'active') THEN
    SELECT COUNT(*) INTO v_active_count
    FROM public.group_memberships
    WHERE user_id = NEW.user_id AND status = 'active' AND id != NEW.id;
    
    IF v_active_count >= 2 THEN
      RAISE EXCEPTION 'User can only be a member of up to 2 active groups at a time';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_group_membership_limit ON public.group_memberships;
CREATE TRIGGER trg_enforce_group_membership_limit
  BEFORE INSERT OR UPDATE ON public.group_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_membership_limit();
