
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to send email notification via edge function
CREATE OR REPLACE FUNCTION public.notify_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supabase_url text := current_setting('app.settings.supabase_url', true);
  _service_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  -- Call the edge function asynchronously via pg_net
  PERFORM extensions.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/send-notification-email',
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
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the notification insert if email fails
    RAISE WARNING 'Email notification failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on user_notifications table
DROP TRIGGER IF EXISTS trigger_send_email_notification ON public.user_notifications;
CREATE TRIGGER trigger_send_email_notification
  AFTER INSERT ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_email();
