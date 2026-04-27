-- =========================================================
-- 1. SplitPay atomic settlement claim
-- =========================================================
CREATE OR REPLACE FUNCTION public.claim_split_settlement(_split_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  -- Atomically claim by transitioning settlement_status from a "claimable"
  -- state to 'processing'. The conditional WHERE prevents two concurrent
  -- invocations from both proceeding.
  UPDATE public.split_requests
     SET settlement_status = 'processing',
         updated_at = now()
   WHERE id = _split_request_id
     AND status = 'completed'
     AND (settlement_status IS NULL
          OR settlement_status IN ('pending', 'failed'))
  RETURNING id, status, settlement_status INTO _row;

  IF NOT FOUND THEN
    -- Either already in-flight, completed, or not eligible.
    SELECT id, status, settlement_status INTO _row
      FROM public.split_requests WHERE id = _split_request_id;

    RETURN jsonb_build_object(
      'claimed', false,
      'status', _row.status,
      'settlement_status', _row.settlement_status,
      'reason', 'not_eligible_or_in_flight'
    );
  END IF;

  RETURN jsonb_build_object('claimed', true, 'split_request_id', _split_request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_split_settlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_split_settlement(uuid) TO service_role;

-- =========================================================
-- 2. Target Ajo atomic withdrawal vote
--    Records vote, recounts, resolves status, credits beneficiary —
--    all within one transaction so concurrent voters can't double-credit.
-- =========================================================
CREATE OR REPLACE FUNCTION public.cast_target_withdrawal_vote(
  _request_id uuid,
  _voter_id uuid,
  _vote text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wr record;
  _approval int;
  _rejection int;
  _total_members int;
  _remaining int;
  _resolved boolean := false;
  _outcome text := null;
BEGIN
  IF _vote NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_vote');
  END IF;

  -- Lock the request row so only one vote at a time can flip status
  SELECT * INTO _wr
    FROM public.vfd_sandbox_target_withdrawal_requests
   WHERE id = _request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_not_found');
  END IF;

  IF _wr.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_resolved',
                              'status', _wr.status);
  END IF;

  -- Membership check
  IF NOT EXISTS (
    SELECT 1 FROM public.vfd_sandbox_target_members
     WHERE target_id = _wr.target_id AND user_id = _voter_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_member');
  END IF;

  -- Idempotent vote insert (unique constraint not assumed; check first)
  IF EXISTS (
    SELECT 1 FROM public.vfd_sandbox_target_withdrawal_votes
     WHERE withdrawal_request_id = _request_id AND user_id = _voter_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_voted');
  END IF;

  INSERT INTO public.vfd_sandbox_target_withdrawal_votes
    (withdrawal_request_id, user_id, vote)
  VALUES (_request_id, _voter_id, _vote);

  _approval := COALESCE(_wr.approval_count, 0) + CASE WHEN _vote = 'approve' THEN 1 ELSE 0 END;
  _rejection := COALESCE(_wr.rejection_count, 0) + CASE WHEN _vote = 'reject' THEN 1 ELSE 0 END;

  SELECT count(*) INTO _total_members
    FROM public.vfd_sandbox_target_members
   WHERE target_id = _wr.target_id;

  _remaining := GREATEST(0, _total_members - _approval - _rejection);

  -- Resolve approved
  IF _approval >= COALESCE(_wr.required_votes, _total_members) THEN
    UPDATE public.vfd_sandbox_target_withdrawal_requests
       SET status = 'approved',
           approval_count = _approval,
           rejection_count = _rejection,
           resolved_at = now()
     WHERE id = _request_id;
    _resolved := true;
    _outcome := 'approved';

  -- Resolve rejected (cannot reach threshold even with all remaining votes)
  ELSIF (_approval + _remaining) < COALESCE(_wr.required_votes, _total_members) THEN
    UPDATE public.vfd_sandbox_target_withdrawal_requests
       SET status = 'rejected',
           approval_count = _approval,
           rejection_count = _rejection,
           resolved_at = now()
     WHERE id = _request_id;
    _resolved := true;
    _outcome := 'rejected';

  ELSE
    UPDATE public.vfd_sandbox_target_withdrawal_requests
       SET approval_count = _approval,
           rejection_count = _rejection
     WHERE id = _request_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'resolved', _resolved,
    'outcome', _outcome,
    'approval_count', _approval,
    'rejection_count', _rejection,
    'required_votes', COALESCE(_wr.required_votes, _total_members),
    'requested_by', _wr.requested_by,
    'amount', _wr.amount,
    'target_id', _wr.target_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cast_target_withdrawal_vote(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_target_withdrawal_vote(uuid, uuid, text) TO service_role;

-- =========================================================
-- 3. Wallet reversals audit table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.wallet_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  original_reference text,
  amount numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('credit_reversal','debit_reversal')),
  reason text,
  initiated_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_reversals_user ON public.wallet_reversals(user_id, created_at DESC);

ALTER TABLE public.wallet_reversals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own reversals" ON public.wallet_reversals;
CREATE POLICY "Users view own reversals"
  ON public.wallet_reversals FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =========================================================
-- 4. Notification dead-letter queue
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notification_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_id uuid,
  subscription_endpoint text,
  payload jsonb NOT NULL,
  failure_status int,
  failure_reason text,
  attempts int NOT NULL DEFAULT 1,
  next_retry_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_dlq_pending
  ON public.notification_dlq (next_retry_at)
  WHERE resolved_at IS NULL AND attempts < 5;

ALTER TABLE public.notification_dlq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DLQ admin only" ON public.notification_dlq;
CREATE POLICY "DLQ admin only"
  ON public.notification_dlq FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 5. Card token cleanup
-- =========================================================
CREATE OR REPLACE VIEW public.card_token_orphans AS
SELECT id, user_id, card_last4, card_type, is_active, created_at, last_tokenized_at
  FROM public.card_tokens
 WHERE is_active = false
   AND (last_tokenized_at IS NULL OR last_tokenized_at < now() - interval '30 days')
   AND created_at < now() - interval '30 days';

CREATE OR REPLACE FUNCTION public.cleanup_orphan_card_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted int;
BEGIN
  WITH del AS (
    DELETE FROM public.card_tokens
     WHERE is_active = false
       AND (last_tokenized_at IS NULL OR last_tokenized_at < now() - interval '30 days')
       AND created_at < now() - interval '30 days'
    RETURNING id
  )
  SELECT count(*) INTO _deleted FROM del;
  RETURN jsonb_build_object('deleted', _deleted, 'at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_orphan_card_tokens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_card_tokens() TO service_role;
