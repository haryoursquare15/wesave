-- Create private bucket for VFD sandbox KYC documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('vfd-sandbox-kyc-docs', 'vfd-sandbox-kyc-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can manage files only inside their own user_id folder
CREATE POLICY "VFD sandbox: users read own KYC files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vfd-sandbox-kyc-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "VFD sandbox: users upload own KYC files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vfd-sandbox-kyc-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "VFD sandbox: users update own KYC files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'vfd-sandbox-kyc-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "VFD sandbox: users delete own KYC files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'vfd-sandbox-kyc-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "VFD sandbox: admins view all KYC files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vfd-sandbox-kyc-docs' AND public.is_any_admin(auth.uid()));

-- Document tracking table
CREATE TABLE public.vfd_sandbox_kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier_level int NOT NULL CHECK (tier_level BETWEEN 1 AND 3),
  document_type text NOT NULL,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  file_size bigint,
  verification_status text NOT NULL DEFAULT 'pending',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE (user_id, document_type)
);

CREATE INDEX idx_vfd_kyc_docs_user ON public.vfd_sandbox_kyc_documents(user_id);
CREATE INDEX idx_vfd_kyc_docs_tier ON public.vfd_sandbox_kyc_documents(tier_level);

ALTER TABLE public.vfd_sandbox_kyc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own KYC documents"
ON public.vfd_sandbox_kyc_documents FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users insert own KYC documents"
ON public.vfd_sandbox_kyc_documents FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own KYC documents"
ON public.vfd_sandbox_kyc_documents FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users delete own KYC documents"
ON public.vfd_sandbox_kyc_documents FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins view all KYC documents"
ON public.vfd_sandbox_kyc_documents FOR SELECT TO authenticated
USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Admins update KYC document verification"
ON public.vfd_sandbox_kyc_documents FOR UPDATE TO authenticated
USING (public.is_any_admin(auth.uid()));