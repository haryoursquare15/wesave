INSERT INTO public.vestara_accounts (account_type, is_system, label, currency)
SELECT 'bills_hold', true, 'Bill payments hold (pending biller confirmation)', 'NGN'
WHERE NOT EXISTS (SELECT 1 FROM public.vestara_accounts WHERE is_system = true AND account_type = 'bills_hold');

ALTER TABLE public.vfd_sandbox_bill_receipts
  ADD COLUMN IF NOT EXISTS hold_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS held_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS timed_out_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bill_receipts_pending_hold
  ON public.vfd_sandbox_bill_receipts (paid_at)
  WHERE status = 'pending';

-- Reserve: wallet -> bills_hold. Idempotent on reference.
CREATE OR REPLACE FUNCTION public.vestara_bill_reserve(_user_id uuid, _amount numeric, _reference text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _wallet_id UUID;
  _hold_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _reference) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  SELECT id INTO _hold_id FROM vestara_accounts
    WHERE is_system = true AND account_type = 'bills_hold';
  IF _hold_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bills hold account missing');
  END IF;

  RETURN vestara_post_transaction(
    'withdrawal', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _wallet_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _hold_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata || jsonb_build_object('hold', true)
  );
END;
$$;

-- Settle: bills_hold -> settlement (value confirmed delivered).
CREATE OR REPLACE FUNCTION public.vestara_bill_settle(_reference text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _hold_tx RECORD;
  _hold_id UUID;
  _settlement_id UUID;
  _new_ref TEXT := _reference || '-SETTLE';
BEGIN
  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _new_ref)
     OR EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _reference || '-REFUND') THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT * INTO _hold_tx FROM vestara_transactions WHERE reference = _reference;
  IF _hold_tx IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hold transaction for reference');
  END IF;

  SELECT id INTO _hold_id FROM vestara_accounts WHERE is_system = true AND account_type = 'bills_hold';
  SELECT id INTO _settlement_id FROM vestara_accounts WHERE is_system = true AND account_type = 'settlement';

  RETURN vestara_post_transaction(
    'transfer', _new_ref, _hold_tx.amount, _hold_tx.initiated_by,
    jsonb_build_array(
      jsonb_build_object('account_id', _hold_id, 'debit', _hold_tx.amount, 'credit', 0),
      jsonb_build_object('account_id', _settlement_id, 'debit', 0, 'credit', _hold_tx.amount)
    ),
    _metadata || jsonb_build_object('source', 'bill_payment_settle', 'original_reference', _reference)
  );
END;
$$;

-- Release: bills_hold -> wallet (biller failed or timed out).
CREATE OR REPLACE FUNCTION public.vestara_bill_release(_reference text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _hold_tx RECORD;
  _hold_id UUID;
  _wallet_id UUID;
  _new_ref TEXT := _reference || '-REFUND';
BEGIN
  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _new_ref) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  IF EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _reference || '-SETTLE') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already settled; cannot refund');
  END IF;

  SELECT * INTO _hold_tx FROM vestara_transactions WHERE reference = _reference;
  IF _hold_tx IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hold transaction for reference');
  END IF;

  SELECT id INTO _hold_id FROM vestara_accounts WHERE is_system = true AND account_type = 'bills_hold';
  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _hold_tx.initiated_by AND account_type = 'wallet' LIMIT 1;
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
  END IF;

  RETURN vestara_post_transaction(
    'reversal', _new_ref, _hold_tx.amount, _hold_tx.initiated_by,
    jsonb_build_array(
      jsonb_build_object('account_id', _hold_id, 'debit', _hold_tx.amount, 'credit', 0),
      jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _hold_tx.amount)
    ),
    _metadata || jsonb_build_object('source', 'bill_payment_release', 'original_reference', _reference)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vestara_bill_reserve(uuid, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vestara_bill_settle(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vestara_bill_release(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vestara_bill_reserve(uuid, numeric, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.vestara_bill_settle(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.vestara_bill_release(text, jsonb) TO service_role;