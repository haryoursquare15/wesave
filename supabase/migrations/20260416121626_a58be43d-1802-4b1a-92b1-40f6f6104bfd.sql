
-- Invites from registered user to registered user
CREATE TABLE public.vfd_sandbox_group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL,
  invitee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(group_id, invitee_id, status)
);

ALTER TABLE public.vfd_sandbox_group_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on vfd_sandbox_group_invites"
  ON public.vfd_sandbox_group_invites FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users can read their own invites"
  ON public.vfd_sandbox_group_invites FOR SELECT
  TO authenticated
  USING (invitee_id = auth.uid() OR inviter_id = auth.uid());

-- Shareable invite links (for unregistered or any user)
CREATE TABLE public.vfd_sandbox_group_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  invite_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vfd_sandbox_group_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on vfd_sandbox_group_invite_links"
  ON public.vfd_sandbox_group_invite_links FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read invite links"
  ON public.vfd_sandbox_group_invite_links FOR SELECT
  TO authenticated USING (true);

CREATE INDEX idx_vfd_sandbox_invite_links_token ON public.vfd_sandbox_group_invite_links(invite_token);
