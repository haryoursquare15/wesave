
-- 1. Fix vestara_thrift_contribute: insert pool with is_system=false
CREATE OR REPLACE FUNCTION public.vestara_thrift_contribute(_user_id uuid, _group_id uuid, _amount numeric, _reference text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wallet_id UUID;
  _pool_id UUID;
BEGIN
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  SELECT id INTO _pool_id FROM vestara_accounts
    WHERE account_type = 'thrift_pool' AND group_ref = _group_id LIMIT 1;

  IF _pool_id IS NULL THEN
    BEGIN
      INSERT INTO vestara_accounts (user_id, account_type, group_ref, label, is_system)
      VALUES (NULL, 'thrift_pool', _group_id, 'Thrift Pool', false)
      RETURNING id INTO _pool_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO _pool_id FROM vestara_accounts
        WHERE account_type = 'thrift_pool' AND group_ref = _group_id LIMIT 1;
    END;
  END IF;

  IF _pool_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not provision thrift pool account');
  END IF;

  RETURN vestara_post_transaction(
    'thrift_contribution', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _pool_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('group_id', _group_id)
  );
END;
$function$;

-- 2. Transfer fee counters (per user, per month)
CREATE TABLE IF NOT EXISTS public.transfer_fee_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month_key text NOT NULL, -- format YYYY-MM (WAT)
  inter_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, month_key)
);

GRANT SELECT ON public.transfer_fee_counters TO authenticated;
GRANT ALL ON public.transfer_fee_counters TO service_role;
ALTER TABLE public.transfer_fee_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transfer counters"
  ON public.transfer_fee_counters FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_transfer_fee_counters_user_month
  ON public.transfer_fee_counters(user_id, month_key);

-- 3. Vestara fee ledger
CREATE TABLE IF NOT EXISTS public.vestara_fee_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fee_type text NOT NULL CHECK (fee_type IN ('transfer_fee','stamp_duty')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reference text,
  tx_reference text,
  transfer_type text, -- 'inter' | 'intra' | 'bill' | 'other'
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vestara_fee_ledger TO authenticated;
GRANT ALL ON public.vestara_fee_ledger TO service_role;
ALTER TABLE public.vestara_fee_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fee ledger"
  ON public.vestara_fee_ledger FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_vestara_fee_ledger_user_created
  ON public.vestara_fee_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vestara_fee_ledger_tx_reference
  ON public.vestara_fee_ledger(tx_reference);
