CREATE OR REPLACE FUNCTION public.notify_sandbox_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _token text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = NEW.user_id) THEN RETURN NEW; END IF;
  SELECT token INTO _token FROM internal_cron_tokens WHERE name = 'internal_notifications';
  PERFORM net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/push-notification',
    body := jsonb_build_object('action','send_push','user_id',NEW.user_id,'title',NEW.title,
      'body',NEW.message,'tag',NEW.notification_type,'notification_id',NEW.id,'url','/app'),
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token',COALESCE(_token,''))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Sandbox push failed: %', SQLERRM;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sandbox_push ON public.vfd_sandbox_notifications;
CREATE TRIGGER trg_sandbox_push AFTER INSERT ON public.vfd_sandbox_notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_sandbox_push();