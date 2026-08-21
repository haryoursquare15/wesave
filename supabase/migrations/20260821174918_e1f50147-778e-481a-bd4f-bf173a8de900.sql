ALTER TABLE public.vfd_sandbox_kyc_documents
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.vfd_sandbox_clients
  ADD COLUMN IF NOT EXISTS kyc_review_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS kyc_review_reason text,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_requested_tier integer;

CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_clients_kyc_review_status
  ON public.vfd_sandbox_clients (kyc_review_status);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_kyc_documents_status
  ON public.vfd_sandbox_kyc_documents (verification_status, uploaded_at);

DROP POLICY IF EXISTS "Admins can view all kyc documents" ON public.vfd_sandbox_kyc_documents;
CREATE POLICY "Admins can view all kyc documents"
  ON public.vfd_sandbox_kyc_documents
  FOR SELECT
  TO authenticated
  USING (is_any_admin(auth.uid()));