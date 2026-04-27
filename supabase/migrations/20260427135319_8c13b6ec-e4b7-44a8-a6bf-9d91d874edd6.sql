-- Transaction PIN storage (bcrypt-hashed)
CREATE TABLE IF NOT EXISTS public.transaction_pins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  pin_set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_pins ENABLE ROW LEVEL SECURITY;

-- Users can only read their own PIN record (never the hash exposure via select-* in client; client uses RPC anyway)
CREATE POLICY "users_select_own_pin"
  ON public.transaction_pins FOR SELECT
  USING (auth.uid() = user_id);

-- Inserts/updates only via edge function (service role); deny direct writes from clients
CREATE POLICY "no_client_insert_pin"
  ON public.transaction_pins FOR INSERT
  WITH CHECK (false);

CREATE POLICY "no_client_update_pin"
  ON public.transaction_pins FOR UPDATE
  USING (false);

CREATE POLICY "no_client_delete_pin"
  ON public.transaction_pins FOR DELETE
  USING (false);

-- Audit log (immutable from client side)
CREATE TABLE IF NOT EXISTS public.pin_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('pin_set','pin_changed','verify_success','verify_failed','locked_out','unlocked')),
  purpose TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_audit_user_created ON public.pin_audit_log(user_id, created_at DESC);

ALTER TABLE public.pin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_pin_audit"
  ON public.pin_audit_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "no_client_insert_pin_audit"
  ON public.pin_audit_log FOR INSERT
  WITH CHECK (false);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_transaction_pins_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transaction_pins_updated_at ON public.transaction_pins;
CREATE TRIGGER trg_transaction_pins_updated_at
  BEFORE UPDATE ON public.transaction_pins
  FOR EACH ROW EXECUTE FUNCTION public.update_transaction_pins_updated_at();