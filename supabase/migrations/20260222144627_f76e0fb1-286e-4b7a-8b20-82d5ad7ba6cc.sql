
-- Create trigger function to notify user when they receive an invite
CREATE OR REPLACE FUNCTION public.notify_invite_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _group_name text;
  _inviter_name text;
BEGIN
  -- Get group name
  SELECT name INTO _group_name FROM thrift_groups WHERE id = NEW.group_id;
  
  -- Get inviter name
  SELECT COALESCE(username, full_name, 'Someone') INTO _inviter_name FROM profiles WHERE id = NEW.inviter_id;

  -- Create notification for the invitee
  INSERT INTO user_notifications (user_id, title, message, notification_type, group_id)
  VALUES (
    NEW.invitee_id,
    'Group Invitation',
    _inviter_name || ' invited you to join ' || COALESCE(_group_name, 'a group') || '.',
    'invite_received',
    NEW.group_id
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Invite notification failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_invite_received ON public.member_invites;
CREATE TRIGGER trigger_notify_invite_received
  AFTER INSERT ON public.member_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_invite_received();
