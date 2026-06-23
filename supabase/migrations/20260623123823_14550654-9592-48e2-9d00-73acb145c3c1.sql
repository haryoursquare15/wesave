
-- 1. Extend vestara_savings for Goal Savings 2.0 (commitment savings + mandate)
ALTER TABLE public.vestara_savings
  ADD COLUMN IF NOT EXISTS commitment_frequency text CHECK (commitment_frequency IN ('weekly','monthly')),
  ADD COLUMN IF NOT EXISTS commitment_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS tenor_count integer,
  ADD COLUMN IF NOT EXISTS next_debit_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_id text,
  ADD COLUMN IF NOT EXISTS mandate_status text CHECK (mandate_status IN ('pending','authorized','failed','cancelled')),
  ADD COLUMN IF NOT EXISTS mandate_fee numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activation_status text CHECK (activation_status IN ('pending_mandate','active','matured','failed')) DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_vestara_savings_next_debit
  ON public.vestara_savings (next_debit_at)
  WHERE activation_status = 'active';

-- 2. Extend rate configs with a frequency dimension (used by goalsave v2)
ALTER TABLE public.vestara_rate_configs
  ADD COLUMN IF NOT EXISTS frequency text CHECK (frequency IN ('weekly','monthly'));

-- 3. Debit schedule
CREATE TABLE IF NOT EXISTS public.vfd_savings_debit_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  savings_id uuid NOT NULL REFERENCES public.vestara_savings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  scheduled_at timestamptz NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','succeeded','failed','retrying','skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  vfd_reference text,
  failed_reason text,
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (savings_id, seq)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vfd_savings_debit_schedule TO authenticated;
GRANT ALL ON public.vfd_savings_debit_schedule TO service_role;
ALTER TABLE public.vfd_savings_debit_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own debit schedule" ON public.vfd_savings_debit_schedule
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all debit schedule" ON public.vfd_savings_debit_schedule
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_debit_schedule_savings ON public.vfd_savings_debit_schedule (savings_id, seq);
CREATE INDEX IF NOT EXISTS idx_debit_schedule_due ON public.vfd_savings_debit_schedule (scheduled_at) WHERE status = 'scheduled';

CREATE TRIGGER trg_debit_schedule_updated
  BEFORE UPDATE ON public.vfd_savings_debit_schedule
  FOR EACH ROW EXECUTE FUNCTION public.vestara_update_timestamp();

-- 4. Mandate events audit
CREATE TABLE IF NOT EXISTS public.vfd_savings_mandate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  savings_id uuid NOT NULL REFERENCES public.vestara_savings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mandate_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.vfd_savings_mandate_events TO authenticated;
GRANT ALL ON public.vfd_savings_mandate_events TO service_role;
ALTER TABLE public.vfd_savings_mandate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own mandate events" ON public.vfd_savings_mandate_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all mandate events" ON public.vfd_savings_mandate_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_mandate_events_savings ON public.vfd_savings_mandate_events (savings_id, created_at DESC);
