CREATE OR REPLACE FUNCTION public.notify_transaction_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_title text;
  v_msg text;
  v_amount text;
  v_ref text;
  v_desc text;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('completed','failed','reversed') THEN
    RETURN NEW;
  END IF;

  v_ref := COALESCE(NEW.reference, NEW.id::text);
  v_amount := '₦' || to_char(COALESCE(NEW.amount,0), 'FM999,999,999,990.00');
  v_desc := COALESCE(NULLIF(NEW.description, ''), NEW.transaction_type);

  -- Idempotency: one notification per transaction reference/status
  IF EXISTS (
    SELECT 1 FROM public.user_notifications n
    WHERE n.user_id = NEW.user_id
      AND n.message LIKE '%Ref: ' || v_ref || '%'
      AND n.message LIKE '%[' || NEW.status || ']%'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'reversed' THEN
    v_type := 'wallet_credited';
    v_title := 'Transaction reversed';
    v_msg := v_amount || ' has been returned to your wallet for ' || v_desc || '.';
  ELSIF NEW.status = 'failed' THEN
    v_type := 'withdrawal_failed';
    v_title := 'Transaction failed';
    v_msg := 'Your ' || v_desc || ' of ' || v_amount || ' did not go through. Any funds held have been released.';
  ELSIF NEW.transaction_type = 'credit' THEN
    v_type := 'wallet_credited';
    v_title := 'Money received';
    v_msg := v_amount || ' has been credited to your wallet. ' || v_desc || '.';
  ELSIF NEW.transaction_type = 'transfer' THEN
    v_type := 'transfer_sent';
    v_title := 'Transfer successful';
    v_msg := v_amount || ' was sent'
      || COALESCE(' to ' || NULLIF(NEW.beneficiary_name, ''), '')
      || COALESCE(' (' || NULLIF(NEW.beneficiary_bank, '') || ')', '')
      || '.';
  ELSE
    v_type := 'wallet_debited';
    v_title := 'Transaction successful';
    v_msg := v_amount || ' was debited from your wallet for ' || v_desc || '.';
  END IF;

  v_msg := v_msg || ' Ref: ' || v_ref || ' [' || NEW.status || ']';

  INSERT INTO public.user_notifications (user_id, title, message, notification_type)
  VALUES (NEW.user_id, v_title, v_msg, v_type);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_transaction_event failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_transaction_event ON public.vfd_sandbox_transactions;
CREATE TRIGGER trg_notify_transaction_event
AFTER INSERT OR UPDATE OF status ON public.vfd_sandbox_transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_transaction_event();