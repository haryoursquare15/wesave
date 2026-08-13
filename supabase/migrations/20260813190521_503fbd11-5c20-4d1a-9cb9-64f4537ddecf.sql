CREATE TABLE IF NOT EXISTS public.credit_guard_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  large_credit_threshold numeric NOT NULL DEFAULT 50000,
  velocity_max_credits integer NOT NULL DEFAULT 5,
  velocity_window_minutes integer NOT NULL DEFAULT 10,
  dupe_window_minutes integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.credit_guard_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.credit_guard_config TO authenticated;
GRANT ALL ON public.credit_guard_config TO service_role;
ALTER TABLE public.credit_guard_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_guard_config_admin_read" ON public.credit_guard_config
  FOR SELECT TO authenticated USING (public.is_any_admin());

CREATE TABLE IF NOT EXISTS public.credit_guard_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  trigger_event text,
  user_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  idempotency_key text,
  narration text,
  outcome text NOT NULL,
  reason text,
  flagged_for_review boolean NOT NULL DEFAULT false,
  review_reason text,
  matched_transaction_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_guard_events_user_idx ON public.credit_guard_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_guard_events_outcome_idx ON public.credit_guard_events (outcome, created_at DESC);
GRANT SELECT ON public.credit_guard_events TO authenticated;
GRANT ALL ON public.credit_guard_events TO service_role;
ALTER TABLE public.credit_guard_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_guard_events_admin_read" ON public.credit_guard_events
  FOR SELECT TO authenticated USING (public.is_any_admin());

CREATE OR REPLACE FUNCTION public.guard_credit(
  _user_id uuid,
  _amount numeric,
  _reference text,
  _source text,
  _narration text DEFAULT NULL,
  _trigger_event text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.credit_guard_config%ROWTYPE;
  dupe_tx uuid;
  recent_count integer := 0;
  allowed boolean := true;
  reason text := NULL;
  flagged boolean := false;
  review_reason text := NULL;
  ev_id uuid;
BEGIN
  SELECT * INTO cfg FROM public.credit_guard_config WHERE id;

  -- 1. Exact idempotency-key (reference) reuse
  SELECT t.id INTO dupe_tx
  FROM public.vestara_transactions t
  WHERE t.reference = _reference
  LIMIT 1;
  IF dupe_tx IS NOT NULL THEN
    allowed := false;
    reason := 'duplicate_reference';
  END IF;

  -- 2. Fuzzy duplicate: same customer, same amount, same source, inside window
  IF allowed AND _user_id IS NOT NULL THEN
    SELECT t.id INTO dupe_tx
    FROM public.vestara_transactions t
    JOIN public.vestara_ledger_entries e ON e.transaction_id = t.id
    JOIN public.vestara_accounts a ON a.id = e.account_id
    WHERE a.user_id = _user_id
      AND e.credit > 0
      AND t.amount = _amount
      AND t.created_at > now() - make_interval(mins => cfg.dupe_window_minutes)
      AND (
        COALESCE(t.metadata->>'source', '') = COALESCE(_source, '')
        OR (_narration IS NOT NULL AND COALESCE(t.metadata->>'narration', '') = _narration)
        OR split_part(t.reference, '-', 1) = split_part(COALESCE(_reference, ''), '-', 1)
      )
    LIMIT 1;
    IF dupe_tx IS NOT NULL THEN
      allowed := false;
      reason := 'near_duplicate_credit';
    END IF;
  END IF;

  -- 3. Sanity thresholds (flag, do not block)
  IF allowed THEN
    IF _amount >= cfg.large_credit_threshold THEN
      flagged := true;
      review_reason := 'large_credit';
    END IF;
    IF _user_id IS NOT NULL THEN
      SELECT count(*) INTO recent_count
      FROM public.vestara_transactions t
      JOIN public.vestara_ledger_entries e ON e.transaction_id = t.id
      JOIN public.vestara_accounts a ON a.id = e.account_id
      WHERE a.user_id = _user_id
        AND e.credit > 0
        AND t.created_at > now() - make_interval(mins => cfg.velocity_window_minutes);
      IF recent_count >= cfg.velocity_max_credits THEN
        flagged := true;
        review_reason := COALESCE(review_reason || '+', '') || 'credit_velocity';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.credit_guard_events (
    source, trigger_event, user_id, amount, idempotency_key, narration,
    outcome, reason, flagged_for_review, review_reason, matched_transaction_id, details
  ) VALUES (
    _source, _trigger_event, _user_id, COALESCE(_amount, 0), _reference, _narration,
    CASE WHEN allowed THEN 'allowed' ELSE 'blocked' END, reason, flagged, review_reason,
    CASE WHEN allowed THEN NULL ELSE dupe_tx END,
    COALESCE(_details, '{}'::jsonb) || jsonb_build_object('recent_credit_count', recent_count)
  ) RETURNING id INTO ev_id;

  RETURN jsonb_build_object(
    'allowed', allowed,
    'reason', reason,
    'flagged', flagged,
    'review_reason', review_reason,
    'event_id', ev_id,
    'matched_transaction_id', dupe_tx
  );
END;
$$;
REVOKE ALL ON FUNCTION public.guard_credit(uuid, numeric, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_credit(uuid, numeric, text, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.vestara_user_ledger_wallet_balance(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(balance), 0)::numeric
  FROM public.vestara_accounts
  WHERE user_id = _user_id AND account_type = 'wallet';
$$;
REVOKE ALL ON FUNCTION public.vestara_user_ledger_wallet_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vestara_user_ledger_wallet_balance(uuid) TO service_role;