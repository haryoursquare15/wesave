-- Internal shared secrets used to authenticate database-triggered edge function calls
INSERT INTO public.internal_cron_tokens (name, token)
SELECT 'internal_notifications', encode(gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.internal_cron_tokens WHERE name = 'internal_notifications');

INSERT INTO public.internal_cron_tokens (name, token)
SELECT 'splitpay_settlement', encode(gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.internal_cron_tokens WHERE name = 'splitpay_settlement');

CREATE OR REPLACE FUNCTION public.notify_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token text;
BEGIN
  SELECT token INTO _token FROM internal_cron_tokens WHERE name = 'internal_notifications';

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
      'x-cron-token', COALESCE(_token, '')
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Email notification failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_user_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token text;
BEGIN
  SELECT token INTO _token FROM internal_cron_tokens WHERE name = 'internal_notifications';

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

CREATE OR REPLACE FUNCTION public.process_split_payment(_split_request_id uuid, _user_id uuid, _amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _wallet_id uuid; _balance numeric; _ledger_id uuid; _participant_id uuid;
  _request_status text; _participant_status text; _all_paid boolean;
  _platform_fee numeric; _fee_per_person numeric; _total_debit numeric;
  _num_people integer; _total_collected numeric; _total_merchant numeric;
  _split_purpose text; _merchant_name text; _merchant_bank text; _merchant_account text;
  _creator_id uuid; _paid_count integer; _total_participants integer;
  _supabase_url text; _settlement_token text;
  _caller uuid := auth.uid();
BEGIN
  -- SECURITY: caller (if authenticated) must equal the user being debited
  IF _caller IS NOT NULL AND _caller <> _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Identity mismatch');
  END IF;

  SELECT status, platform_fee, number_of_people, purpose,
         merchant_account_name, merchant_bank_name, merchant_account_number, creator_user_id
  INTO _request_status, _platform_fee, _num_people, _split_purpose,
       _merchant_name, _merchant_bank, _merchant_account, _creator_id
  FROM split_requests WHERE id = _split_request_id FOR UPDATE;
  IF _request_status IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Split request not found'); END IF;
  IF _request_status != 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'Split request is not active'); END IF;

  SELECT id, status INTO _participant_id, _participant_status
  FROM split_participants WHERE split_request_id = _split_request_id AND user_id = _user_id FOR UPDATE;
  IF _participant_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'You are not a participant'); END IF;
  IF _participant_status = 'paid' THEN RETURN jsonb_build_object('success', false, 'error', 'Already paid'); END IF;
  IF _participant_status = 'declined' THEN RETURN jsonb_build_object('success', false, 'error', 'You have declined this split'); END IF;

  _fee_per_person := CEIL((_platform_fee / _num_people) * 100) / 100;
  _total_debit := _amount + _fee_per_person;

  SELECT id, available_balance INTO _wallet_id, _balance FROM wallets WHERE user_id = _user_id FOR UPDATE;
  IF _wallet_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Wallet not found'); END IF;
  IF _balance < _total_debit THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Insufficient balance. Need ₦%s (₦%s share + ₦%s platform fee)', _total_debit, _amount, _fee_per_person));
  END IF;

  UPDATE wallets SET available_balance = available_balance - _total_debit, updated_at = now() WHERE id = _wallet_id;

  INSERT INTO ledger_entries (wallet_id, user_id, amount, entry_type, reference_type, reference_id,
    balance_before, balance_after, locked_before, locked_after, description)
  VALUES (_wallet_id, _user_id, _total_debit, 'debit', 'split_payment',
    'split-' || _split_request_id::text || '-' || _user_id::text,
    _balance, _balance - _total_debit,
    COALESCE((SELECT locked_balance FROM wallets WHERE id = _wallet_id), 0),
    COALESCE((SELECT locked_balance FROM wallets WHERE id = _wallet_id), 0),
    format('SplitPay: ₦%s share + ₦%s fee for "%s"', _amount, _fee_per_person, _split_purpose))
  RETURNING id INTO _ledger_id;

  INSERT INTO split_transactions (split_request_id, user_id, amount, wallet_ledger_id, status)
  VALUES (_split_request_id, _user_id, _amount, _ledger_id, 'completed');

  INSERT INTO transactions (user_id, wallet_id, type, amount, status, description, reference)
  VALUES (_user_id, _wallet_id, 'split_payment', _total_debit, 'completed',
    format('SplitPay: ₦%s share + ₦%s fee for "%s"', _amount, _fee_per_person, _split_purpose),
    'split-' || _split_request_id::text || '-' || _user_id::text);

  IF _fee_per_person > 0 THEN
    INSERT INTO platform_ledger (amount, entry_type, source_type, source_id, source_user_id,
      balance_before, balance_after, description)
    VALUES (_fee_per_person, 'fee_collected', 'split_payment', _split_request_id::text, _user_id,
      COALESCE((SELECT available_balance FROM platform_wallet WHERE wallet_type = 'revenue' LIMIT 1), 0),
      COALESCE((SELECT available_balance FROM platform_wallet WHERE wallet_type = 'revenue' LIMIT 1), 0) + _fee_per_person,
      format('SplitPay fee from %s for "%s"', _user_id::text, _split_purpose));

    UPDATE platform_wallet SET available_balance = available_balance + _fee_per_person,
      total_collected = total_collected + _fee_per_person, updated_at = now()
    WHERE wallet_type = 'revenue';
  END IF;

  UPDATE split_participants SET status = 'paid', paid_at = now() WHERE id = _participant_id;

  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (_user_id, 'split_payment_made', 'split_request', _split_request_id::text,
    jsonb_build_object('amount', _amount, 'fee', _fee_per_person, 'total_debited', _total_debit,
      'purpose', _split_purpose, 'ledger_id', _ledger_id));

  SELECT COUNT(*) FILTER (WHERE status = 'paid'),
         COUNT(*) FILTER (WHERE status NOT IN ('declined'))
  INTO _paid_count, _total_participants
  FROM split_participants WHERE split_request_id = _split_request_id;

  _all_paid := (_paid_count >= _num_people AND _total_participants >= _num_people);

  IF _all_paid THEN
    SELECT COALESCE(SUM(amount), 0) INTO _total_merchant
    FROM split_transactions WHERE split_request_id = _split_request_id AND status = 'completed';

    UPDATE split_requests SET status = 'completed', settlement_status = 'processing',
        settlement_initiated_at = now(), updated_at = now()
    WHERE id = _split_request_id;

    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (_creator_id, 'split_merchant_settlement', 'split_request', _split_request_id::text,
      jsonb_build_object('total_merchant_amount', _total_merchant, 'total_platform_fee', _platform_fee,
        'paid_participants', _paid_count, 'merchant_name', _merchant_name,
        'merchant_bank', _merchant_bank, 'merchant_account', _merchant_account,
        'purpose', _split_purpose, 'settlement_status', 'processing'));

    INSERT INTO user_notifications (user_id, title, message, notification_type)
    VALUES (_creator_id, 'Split Complete — Settlement Processing',
      format('All participants have paid for "%s". ₦%s is being transferred to %s.',
        _split_purpose, _total_merchant, _merchant_name),
      'split_completed');

    _supabase_url := current_setting('app.settings.supabase_url', true);
    SELECT token INTO _settlement_token FROM internal_cron_tokens WHERE name = 'splitpay_settlement';

    -- Only the split id is sent; the settlement function reads the authoritative
    -- merchant/amount details from split_requests itself.
    PERFORM net.http_post(
      url := COALESCE(_supabase_url, 'https://sdwkqwmqgpsjrmijkdix.supabase.co') || '/functions/v1/splitpay-merchant-settlement',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-token', COALESCE(_settlement_token, '')),
      body := jsonb_build_object('split_request_id', _split_request_id));
  END IF;

  RETURN jsonb_build_object('success', true, 'ledger_id', _ledger_id, 'fee_charged', _fee_per_person,
    'all_paid', _all_paid, 'paid_count', _paid_count, 'required_count', _num_people,
    'merchant_settlement', CASE WHEN _all_paid THEN jsonb_build_object(
      'amount', _total_merchant, 'merchant', _merchant_name, 'status', 'processing') ELSE NULL END);
END;
$function$;