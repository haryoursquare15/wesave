CREATE OR REPLACE FUNCTION public.notify_sandbox_whatsapp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _token text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM whatsapp_preferences WHERE user_id = NEW.user_id AND opted_in) THEN
    RETURN NEW;
  END IF;
  SELECT token INTO _token FROM internal_cron_tokens WHERE name = 'internal_notifications';
  PERFORM net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/whatsapp-dispatch',
    body := jsonb_build_object('record', jsonb_build_object(
      'id', NEW.id, 'user_id', NEW.user_id, 'title', NEW.title, 'message', NEW.message,
      'notification_type', NEW.notification_type, 'group_id', NEW.group_id)),
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token', COALESCE(_token,''))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'WhatsApp dispatch failed: %', SQLERRM;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_sandbox_whatsapp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sandbox_whatsapp ON public.vfd_sandbox_notifications;
CREATE TRIGGER trg_sandbox_whatsapp AFTER INSERT ON public.vfd_sandbox_notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_sandbox_whatsapp();