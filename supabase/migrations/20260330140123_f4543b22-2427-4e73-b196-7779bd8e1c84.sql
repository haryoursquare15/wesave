
-- Sandbox associations table (mirrors production associations)
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  admin_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  member_count INTEGER NOT NULL DEFAULT 1,
  max_members INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sandbox association memberships
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_association_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.vfd_sandbox_associations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (association_id, user_id)
);

-- Sandbox association wallets
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_association_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.vfd_sandbox_associations(id) ON DELETE CASCADE UNIQUE,
  available_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sandbox association contributions (tracks individual member contributions)
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_association_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.vfd_sandbox_associations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  narration TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vfd_sandbox_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_association_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_association_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_association_contributions ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "Authenticated users can read sandbox associations"
  ON public.vfd_sandbox_associations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read sandbox association memberships"
  ON public.vfd_sandbox_association_memberships FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read sandbox association wallets"
  ON public.vfd_sandbox_association_wallets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read sandbox association contributions"
  ON public.vfd_sandbox_association_contributions FOR SELECT TO authenticated USING (true);

-- Service role handles all writes via edge functions
