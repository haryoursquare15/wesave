-- 1) Payout bank-evidence guard: no payout may be flagged bank-confirmed
--    without a real VFD transfer reference.
CREATE OR REPLACE FUNCTION public.enforce_payout_bank_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.net_amount, 0) > 0
     AND NEW.bank_status = 'confirmed'
     AND COALESCE(NULLIF(TRIM(NEW.vfd_reference), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'payout % cannot be bank_confirmed without a VFD transfer reference', COALESCE(NEW.id::text, 'new');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_payout_bank_evidence ON public.vfd_sandbox_group_payouts;
CREATE TRIGGER trg_enforce_payout_bank_evidence
BEFORE INSERT OR UPDATE ON public.vfd_sandbox_group_payouts
FOR EACH ROW EXECUTE FUNCTION public.enforce_payout_bank_evidence();

-- 2) Mandate debit claim: cycle-scoped slots + bounded retry re-arm.
CREATE OR REPLACE FUNCTION public.claim_mandate_debit_attempt(
  _mandate_id uuid,
  _scheduled_date date,
  _amount numeric,
  _transaction_reference text,
  _slot_key text DEFAULT NULL,
  _retry_after_minutes integer DEFAULT 60,
  _max_attempts integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.mandates%ROWTYPE;
  _base text;
  _key text;
  _attempt public.mandate_debit_attempts%ROWTYPE;
  _tries integer;
  _new_id uuid;
BEGIN
  IF NOT (public.is_backend_role() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO _m FROM public.mandates WHERE id = _mandate_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'mandate_not_found');
  END IF;
  IF _m.status <> 'bank_approved' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'mandate_not_approved', 'status', _m.status);
  END IF;

  -- Slot identity: a cycle tag when the caller supplies one (thrift), else the
  -- calendar date (target ajo / goalsave cadence).
  _base := _mandate_id::text || '|' || COALESCE(NULLIF(TRIM(_slot_key), ''), _scheduled_date::text);
  _key := _base;

  INSERT INTO public.mandate_debit_attempts
    (mandate_id, user_id, scheduled_date, idempotency_key, transaction_reference, amount)
  VALUES (_mandate_id, _m.user_id, _scheduled_date, _key, _transaction_reference, _amount)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _new_id;

  IF _new_id IS NOT NULL THEN
    RETURN jsonb_build_object('claimed', true, 'attempt_id', _new_id, 'idempotency_key', _key, 'user_id', _m.user_id);
  END IF;

  -- A slot already exists. Look at the LATEST attempt for this slot.
  SELECT * INTO _attempt
  FROM public.mandate_debit_attempts
  WHERE mandate_id = _mandate_id
    AND (idempotency_key = _base OR idempotency_key LIKE _base || '#r%')
  ORDER BY created_at DESC
  LIMIT 1;

  -- Anything not definitively failed stays locked (succeeded / in-flight).
  IF _attempt.status IS DISTINCT FROM 'failed' THEN
    RETURN jsonb_build_object(
      'claimed', false, 'reason', 'already_attempted',
      'attempt_id', _attempt.id, 'attempt_status', _attempt.status
    );
  END IF;

  -- Permanently dead mandates are never re-armed.
  IF _attempt.failure_class IN ('mandate_revoked', 'not_approved') THEN
    RETURN jsonb_build_object(
      'claimed', false, 'reason', 'failure_not_retryable',
      'attempt_id', _attempt.id, 'failure_class', _attempt.failure_class
    );
  END IF;

  SELECT count(*) INTO _tries
  FROM public.mandate_debit_attempts
  WHERE mandate_id = _mandate_id
    AND (idempotency_key = _base OR idempotency_key LIKE _base || '#r%');

  IF _tries >= GREATEST(1, _max_attempts) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'retry_budget_exhausted', 'attempts', _tries);
  END IF;

  IF COALESCE(_attempt.completed_at, _attempt.created_at) > now() - make_interval(mins => GREATEST(0, _retry_after_minutes)) THEN
    RETURN jsonb_build_object(
      'claimed', false, 'reason', 'retry_cooldown',
      'attempt_id', _attempt.id, 'retry_after_minutes', _retry_after_minutes
    );
  END IF;

  _key := _base || '#r' || _tries::text;

  INSERT INTO public.mandate_debit_attempts
    (mandate_id, user_id, scheduled_date, idempotency_key, transaction_reference, amount)
  VALUES (_mandate_id, _m.user_id, _scheduled_date, _key, _transaction_reference, _amount)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _new_id;

  IF _new_id IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_attempted');
  END IF;

  RETURN jsonb_build_object('claimed', true, 'attempt_id', _new_id, 'idempotency_key', _key, 'user_id', _m.user_id, 'retry', _tries);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mandate_debit_attempt(uuid, date, numeric, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_mandate_debit_attempt(uuid, date, numeric, text, text, integer, integer) TO service_role;

DROP FUNCTION IF EXISTS public.claim_mandate_debit_attempt(uuid, date, numeric, text);