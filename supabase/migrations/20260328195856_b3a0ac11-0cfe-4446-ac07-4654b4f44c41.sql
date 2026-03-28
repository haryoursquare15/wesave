
-- VFD Sandbox Clients table
CREATE TABLE public.vfd_sandbox_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vfd_client_id text,
  vfd_account_number text,
  bvn text,
  full_name text,
  phone text,
  gender text,
  date_of_birth text,
  tier text DEFAULT 'tier1',
  kyc_method text,
  consent_status text DEFAULT 'pending',
  account_status text DEFAULT 'pending',
  balance numeric DEFAULT 0,
  source text DEFAULT 'vfd_sandbox',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.vfd_sandbox_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own VFD client"
  ON public.vfd_sandbox_clients FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own VFD client"
  ON public.vfd_sandbox_clients FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own VFD client"
  ON public.vfd_sandbox_clients FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all VFD clients"
  ON public.vfd_sandbox_clients FOR SELECT
  TO authenticated
  USING (public.is_any_admin(auth.uid()));

-- VFD Sandbox Transactions table
CREATE TABLE public.vfd_sandbox_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vfd_account_number text,
  amount numeric NOT NULL,
  transaction_type text NOT NULL,
  status text DEFAULT 'pending',
  reference text,
  vfd_reference text,
  beneficiary_account text,
  beneficiary_bank text,
  beneficiary_name text,
  beneficiary_bank_code text,
  description text,
  source text DEFAULT 'vfd_sandbox',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.vfd_sandbox_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own VFD transactions"
  ON public.vfd_sandbox_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all VFD transactions"
  ON public.vfd_sandbox_transactions FOR SELECT
  TO authenticated
  USING (public.is_any_admin(auth.uid()));

-- VFD Sandbox Webhook Logs table
CREATE TABLE public.vfd_sandbox_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.vfd_sandbox_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view VFD webhook logs"
  ON public.vfd_sandbox_webhook_logs FOR SELECT
  TO authenticated
  USING (public.is_any_admin(auth.uid()));

NOTIFY pgrst, 'reload schema';
