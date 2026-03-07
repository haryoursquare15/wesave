
-- Trigger to send browser push notification when a new user_notification is created
CREATE OR REPLACE FUNCTION public.notify_user_push()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Fire and forget push notification via edge function
  PERFORM net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/push-notification',
    body := jsonb_build_object(
      'action', 'send_push',
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'tag', NEW.notification_type,
      'notification_id', NEW.id,
      'url', CASE
        WHEN NEW.group_id IS NOT NULL THEN '/groups/' || NEW.group_id
        ELSE '/dashboard'
      END
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkd2txd21xZ3BzanJtaWprZGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMTE4MzQsImV4cCI6MjA4NTU4NzgzNH0.UNRTO1JUQen6hjQuB98_CZ00f4z7DLOAuScjPL0jPG4'
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Push notification failed: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- Create trigger (after the existing email trigger)
CREATE TRIGGER on_user_notification_push
  AFTER INSERT ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_push();

NOTIFY pgrst, 'reload schema';
