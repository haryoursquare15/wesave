
-- Permanent GOAL campaign credit trigger.
-- Fires when a vfd_sandbox_transactions row transitions to status='completed'
-- with beneficiary_account = platform pool NUBAN and description containing
-- GOAL-XXXXXXXX (matching the first 8 hex chars of a campaign id).
-- Idempotent via UNIQUE(vfd_session_id) on vfd_sandbox_campaign_inflows.

CREATE OR REPLACE FUNCTION public.credit_goal_campaign_from_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_nuban CONSTANT TEXT := '1001695610';
  v_ref TEXT;
  v_prefix TEXT;
  v_campaign RECORD;
  v_session_key TEXT;
  v_payer_name TEXT;
  v_inserted BOOLEAN := FALSE;
  v_new_raised NUMERIC;
  v_new_escrow NUMERIC;
  v_new_count INT;
BEGIN
  -- Only act on completed outbound transfers to the platform pool
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF NEW.beneficiary_account IS DISTINCT FROM v_pool_nuban THEN RETURN NEW; END IF;
  IF NEW.transaction_type NOT IN ('transfer', 'debit') THEN RETURN NEW; END IF;

  -- Extract GOAL-XXXXXXXX from description (case-insensitive)
  v_ref := (regexp_match(upper(coalesce(NEW.description, '')), 'GOAL-[A-F0-9]{8}'))[1];
  IF v_ref IS NULL THEN RETURN NEW; END IF;

  v_prefix := lower(replace(v_ref, 'GOAL-', ''));

  -- Look up campaign by id prefix; skip on ambiguous match
  SELECT c.* INTO v_campaign
  FROM public.vfd_sandbox_campaigns c
  WHERE lower(c.id::text) LIKE v_prefix || '%'
    AND c.status IN ('active', 'completed')
  LIMIT 2;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Session key: prefer VFD session id, else our reference
  v_session_key := COALESCE(NULLIF(NEW.session_id, ''), NEW.reference);

  -- Payer name from profile
  SELECT full_name INTO v_payer_name
  FROM public.vfd_sandbox_clients
  WHERE user_id = NEW.user_id
  LIMIT 1;
  v_payer_name := COALESCE(v_payer_name, 'In-app Transfer');

  -- Idempotent insert
  BEGIN
    INSERT INTO public.vfd_sandbox_campaign_inflows (
      campaign_id, amount, vfd_session_id, vfd_reference,
      payer_account, payer_name, payer_bank, narration,
      raw_payload, source, status
    ) VALUES (
      v_campaign.id, NEW.amount, v_session_key, COALESCE(NEW.vfd_reference, NEW.reference),
      NEW.vfd_account_number, v_payer_name, 'Vestara (VFD)', NEW.description,
      jsonb_build_object('source','trigger_from_transfer','tx_id', NEW.id, 'reference', NEW.reference),
      'in_app_transfer', 'credited'
    );
    v_inserted := TRUE;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := FALSE;
  END;

  IF NOT v_inserted THEN RETURN NEW; END IF;

  -- Update campaign aggregates
  v_new_raised := COALESCE(v_campaign.raised_amount, 0) + NEW.amount;
  v_new_escrow := COALESCE(v_campaign.escrow_balance, 0) + NEW.amount;
  v_new_count  := COALESCE(v_campaign.contributor_count, 0) + 1;

  UPDATE public.vfd_sandbox_campaigns
     SET raised_amount = v_new_raised,
         escrow_balance = v_new_escrow,
         contributor_count = v_new_count,
         status = CASE WHEN v_new_raised >= goal_amount THEN 'completed' ELSE status END,
         updated_at = now()
   WHERE id = v_campaign.id;

  -- Public contribution row
  INSERT INTO public.vfd_sandbox_campaign_contributions (
    campaign_id, contributor_id, amount, anonymous, message,
    contributor_name, contribution_reference
  ) VALUES (
    v_campaign.id, NEW.user_id, NEW.amount, false, NULL,
    v_payer_name, v_session_key
  );

  -- Notify creator
  INSERT INTO public.vfd_sandbox_notifications (
    user_id, title, message, notification_type
  ) VALUES (
    v_campaign.creator_id,
    'New campaign contribution',
    'Your campaign "' || v_campaign.title || '" received ₦' ||
      to_char(NEW.amount, 'FM999,999,999,990') || ' from ' || v_payer_name ||
      '. Escrow: ₦' || to_char(v_new_escrow, 'FM999,999,999,990') || '.',
    'campaign_contribution'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_goal_campaign_from_transfer ON public.vfd_sandbox_transactions;
CREATE TRIGGER trg_credit_goal_campaign_from_transfer
AFTER INSERT OR UPDATE OF status ON public.vfd_sandbox_transactions
FOR EACH ROW
EXECUTE FUNCTION public.credit_goal_campaign_from_transfer();
