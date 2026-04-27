-- 1) Atomic balance delta RPC
CREATE OR REPLACE FUNCTION public.apply_balance_delta(
  _user_id uuid,
  _total_delta numeric DEFAULT 0,
  _locked_delta numeric DEFAULT 0,
  _savings_delta numeric DEFAULT 0,
  _require_available numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bal RECORD;
  new_total numeric;
  new_locked numeric;
  new_savings numeric;
  new_available numeric;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT total_balance, locked_balance, savings_balance
    INTO bal
    FROM public.vfd_user_balances
   WHERE user_id = _user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.vfd_user_balances (user_id, total_balance, locked_balance, savings_balance)
    VALUES (_user_id, 0, 0, 0)
    RETURNING total_balance, locked_balance, savings_balance INTO bal;
  END IF;

  new_total   := bal.total_balance   + COALESCE(_total_delta, 0);
  new_locked  := bal.locked_balance  + COALESCE(_locked_delta, 0);
  new_savings := bal.savings_balance + COALESCE(_savings_delta, 0);

  -- Clamp to zero (no negatives)
  IF new_total   < 0 THEN new_total   := 0; END IF;
  IF new_locked  < 0 THEN new_locked  := 0; END IF;
  IF new_savings < 0 THEN new_savings := 0; END IF;

  new_available := new_total - new_locked - new_savings;

  -- Optional pre-flight: require available balance after delta
  IF _require_available IS NOT NULL AND new_available < _require_available THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_available',
      'available', new_available,
      'total', new_total,
      'locked', new_locked,
      'savings', new_savings
    );
  END IF;

  UPDATE public.vfd_user_balances
     SET total_balance   = new_total,
         locked_balance  = new_locked,
         savings_balance = new_savings,
         updated_at      = now()
   WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'available', new_available,
    'total', new_total,
    'locked', new_locked,
    'savings', new_savings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_balance_delta(uuid, numeric, numeric, numeric, numeric) TO service_role;

-- 2) Flow health table for the sandbox monitoring dashboard
CREATE TABLE IF NOT EXISTS public.flow_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass','warn','fail')),
  success_rate numeric NOT NULL DEFAULT 0,
  last_error text,
  details jsonb DEFAULT '{}'::jsonb,
  checked_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flow_health_flow_name_checked_at_idx
  ON public.flow_health (flow_name, checked_at DESC);

ALTER TABLE public.flow_health ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (admin UI gates further on the client side)
CREATE POLICY "Authenticated can view flow health"
  ON public.flow_health
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role writes (no INSERT/UPDATE/DELETE policy for users)