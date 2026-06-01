
CREATE OR REPLACE FUNCTION public.send_notification_email_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_name text;
  v_service_key text;
  v_url text := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/send-transactional-email';
  v_transactional_types text[] := ARRAY[
    'contribution_success','contribution_failed','contribution_received',
    'wallet_credited','wallet_debited','wallet_funded',
    'withdrawal_initiated','withdrawal_completed','withdrawal_failed','withdrawal_reversed',
    'split_invite','split_completed','split_decline','split_paid',
    'split_settlement_completed','split_settlement_failed',
    'target_achieved','target_contribution',
    'payout_received','payout_processed',
    'transfer_sent','transfer_received',
    'deposit_received',
    'invite_received','invite_accepted',
    'vestara_interest','vestara_unlock','vestara_lock','vestara_credited',
    'goal_contribution','goal_completed',
    'referral_bonus','referral_credited'
  ];
  v_action_url text := 'https://vestara.ng/dashboard';
BEGIN
  IF NOT (NEW.notification_type = ANY(v_transactional_types)) THEN
    RETURN NEW;
  END IF;

  SELECT u.email, COALESCE(p.full_name, split_part(u.email,'@',1))
    INTO v_email, v_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = NEW.user_id;

  IF v_email IS NULL THEN RETURN NEW; END IF;

  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_key := NULL;
  END;

  IF v_service_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'templateName','notification',
      'recipientEmail', v_email,
      'idempotencyKey', 'notif-' || NEW.id::text,
      'templateData', jsonb_build_object(
        'recipientName', v_name,
        'title', NEW.title,
        'message', NEW.message,
        'actionUrl', v_action_url,
        'actionLabel', 'Open Vestara'
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'send_notification_email_trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_send_notification_email ON public.user_notifications;
CREATE TRIGGER trg_send_notification_email
AFTER INSERT ON public.user_notifications
FOR EACH ROW EXECUTE FUNCTION public.send_notification_email_trigger();
