-- 1. Extend associations with approval workflow + document URLs
ALTER TABLE public.vfd_sandbox_associations
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS signatures_url text,
  ADD COLUMN IF NOT EXISTS request_letter_url text,
  ADD COLUMN IF NOT EXISTS executive_ids_url text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Constraint on approval_status
DO $$ BEGIN
  ALTER TABLE public.vfd_sandbox_associations
    ADD CONSTRAINT vfd_sandbox_associations_approval_status_check
    CHECK (approval_status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Allow exco role
DO $$ BEGIN
  ALTER TABLE public.vfd_sandbox_association_memberships
    ADD CONSTRAINT vfd_sandbox_association_memberships_role_check
    CHECK (role IN ('admin','exco','member'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Invites table
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_association_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL REFERENCES public.vfd_sandbox_associations(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (association_id, invitee_id)
);
CREATE INDEX IF NOT EXISTS idx_assoc_invites_invitee ON public.vfd_sandbox_association_invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_assoc_invites_assoc ON public.vfd_sandbox_association_invites(association_id);

ALTER TABLE public.vfd_sandbox_association_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Invitee or admin can read invites"
    ON public.vfd_sandbox_association_invites FOR SELECT
    TO authenticated
    USING (
      invitee_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.vfd_sandbox_associations a WHERE a.id = association_id AND a.admin_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Association chat (separate from thrift chat)
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_association_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL REFERENCES public.vfd_sandbox_associations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  message_type text DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assoc_chat_assoc ON public.vfd_sandbox_association_chat(association_id, created_at DESC);

ALTER TABLE public.vfd_sandbox_association_chat ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Members can read association chat"
    ON public.vfd_sandbox_association_chat FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.vfd_sandbox_association_memberships m
        WHERE m.association_id = vfd_sandbox_association_chat.association_id
          AND m.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Members can post association chat"
    ON public.vfd_sandbox_association_chat FOR INSERT
    TO authenticated
    WITH CHECK (
      user_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.vfd_sandbox_association_memberships m
        WHERE m.association_id = vfd_sandbox_association_chat.association_id
          AND m.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Storage bucket for association documents (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('sandbox-association-docs','sandbox-association-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: admin uploads/read for their own association folder (path = associationId/...).
-- We allow any authenticated user to upload to their own `pending/{userId}/...` folder before the
-- association is created, then the edge function moves the path. To keep it simple here:
-- 1) Authenticated users can upload to a folder that starts with their own user id.
-- 2) Authenticated users can read files whose path starts with their own user id.
DO $$ BEGIN
  CREATE POLICY "Users upload assoc docs to own folder"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'sandbox-association-docs'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users read own assoc docs"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'sandbox-association-docs'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Platform admins (existing has_role function) can read all assoc docs
DO $$ BEGIN
  CREATE POLICY "Platform admins read all assoc docs"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'sandbox-association-docs'
      AND public.has_role(auth.uid(), 'admin'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;