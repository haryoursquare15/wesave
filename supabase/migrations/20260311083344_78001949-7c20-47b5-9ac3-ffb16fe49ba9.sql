
-- Simple RPC to insert notifications (bypasses RLS)
CREATE OR REPLACE FUNCTION public.insert_user_notification(
  _user_id uuid,
  _title text,
  _message text,
  _notification_type text DEFAULT 'info'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_notifications (user_id, title, message, notification_type)
  VALUES (_user_id, _title, _message, _notification_type);
END;
$$;

NOTIFY pgrst, 'reload schema';
