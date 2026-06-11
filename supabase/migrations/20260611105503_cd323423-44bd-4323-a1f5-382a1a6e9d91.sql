CREATE TABLE public.vestara_settlement_balance_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  account_number text,
  event_type text NOT NULL,
  reference text NOT NULL,
  vestara_transaction_id uuid,
  vfd_transaction_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  wallet_balance_before numeric,
  wallet_balance_after numeric,
  settlement_balance_before numeric,
  settlement_balance_after numeric,
  legacy_wallet_balance_after numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vestara_settlement_balance_audit TO authenticated;
GRANT ALL ON public.vestara_settlement_balance_audit TO service_role;

ALTER TABLE public.vestara_settlement_balance_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settlement audit"
ON public.vestara_settlement_balance_audit
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all settlement audit"
ON public.vestara_settlement_balance_audit
FOR SELECT
TO authenticated
USING (public.is_any_admin(auth.uid()));

CREATE INDEX idx_vestara_settlement_audit_user_created
ON public.vestara_settlement_balance_audit(user_id, created_at DESC);

CREATE INDEX idx_vestara_settlement_audit_reference
ON public.vestara_settlement_balance_audit(reference);

CREATE TABLE public.intra_transfer_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  sender_user_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  from_account text NOT NULL,
  to_account text NOT NULL,
  amount numeric NOT NULL,
  narration text,
  sender_vfd_transaction_id uuid,
  recipient_vfd_transaction_id uuid,
  recipient_vestara_transaction_id uuid,
  settlement_status text NOT NULL DEFAULT 'completed',
  sender_balance_before numeric,
  sender_balance_after numeric,
  recipient_balance_before numeric,
  recipient_balance_after numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.intra_transfer_reports TO authenticated;
GRANT ALL ON public.intra_transfer_reports TO service_role;

ALTER TABLE public.intra_transfer_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intra transfer reports"
ON public.intra_transfer_reports
FOR SELECT
TO authenticated
USING (sender_user_id = auth.uid() OR recipient_user_id = auth.uid());

CREATE POLICY "Admins can view all intra transfer reports"
ON public.intra_transfer_reports
FOR SELECT
TO authenticated
USING (public.is_any_admin(auth.uid()));

CREATE INDEX idx_intra_transfer_reports_sender_created
ON public.intra_transfer_reports(sender_user_id, created_at DESC);

CREATE INDEX idx_intra_transfer_reports_recipient_created
ON public.intra_transfer_reports(recipient_user_id, created_at DESC);

CREATE INDEX idx_intra_transfer_reports_accounts_created
ON public.intra_transfer_reports(from_account, to_account, created_at DESC);