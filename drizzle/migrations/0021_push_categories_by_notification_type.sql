CREATE OR REPLACE FUNCTION public.notify_user_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token text;
  _category text;
BEGIN
  SELECT token INTO _token FROM internal_cron_tokens WHERE name = 'internal_notifications';

  _category := CASE
    WHEN NEW.notification_type ILIKE ANY (ARRAY['%security%', '%login%', '%sign_in%', '%pin%', '%password%', '%device%', '%freeze%', '%kyc%']) THEN 'security'
    WHEN NEW.notification_type ILIKE ANY (ARRAY['%offer%', '%promo%', '%product%', '%announcement%', '%campaign%']) THEN 'marketing'
    ELSE 'transactions'
  END;

  PERFORM net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/push-notification',
    body := jsonb_build_object(
      'action', 'send_push',
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'tag', NEW.notification_type,
      'notification_id', NEW.id,
      'category', _category,
      'url', CASE
        WHEN NEW.group_id IS NOT NULL THEN '/groups/' || NEW.group_id
        ELSE '/dashboard'
      END
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', COALESCE(_token, '')
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Push notification failed: %', SQLERRM;
    RETURN NEW;
END;
$$;