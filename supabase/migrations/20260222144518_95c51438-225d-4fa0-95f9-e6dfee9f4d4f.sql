
-- Update the trigger function to use hardcoded project URL
CREATE OR REPLACE FUNCTION public.notify_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/send-notification-email',
    body := jsonb_build_object('record', jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'notification_type', NEW.notification_type,
      'group_id', NEW.group_id
    )),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkd2txd21xZ3BzanJtaWprZGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMTE4MzQsImV4cCI6MjA4NTU4NzgzNH0.UNRTO1JUQen6hjQuB98_CZ00f4z7DLOAuScjPL0jPG4'
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Email notification failed: %', SQLERRM;
    RETURN NEW;
END;
$$;
