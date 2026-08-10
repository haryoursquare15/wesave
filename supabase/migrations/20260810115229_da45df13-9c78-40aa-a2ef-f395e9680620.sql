-- System account for VFD's per-transaction CHRG deductions on the pool.
INSERT INTO public.vestara_accounts (user_id, account_type, label, is_system, balance)
SELECT NULL, 'vfd_charges_expense', 'VFD transaction charges (bank CHRG on bills)', true, 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.vestara_accounts WHERE is_system = true AND account_type = 'vfd_charges_expense'
);

-- Post the two correcting legs for a settled bill once the real pool debit is known.
CREATE OR REPLACE FUNCTION public.vestara_bill_reconcile_vfd_debit(
  _reference text,
  _face_amount numeric,
  _actual_debit numeric,
  _charge_amount numeric DEFAULT 0,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _settlement_id UUID;
  _revenue_id UUID;
  _charges_id UUID;
  _initiated_by UUID;
  _discount NUMERIC := round(COALESCE(_face_amount,0) - COALESCE(_actual_debit,0), 2);
  _charge NUMERIC := round(COALESCE(_charge_amount,0), 2);
  _disc_ref TEXT := _reference || '-VFDDISC';
  _chrg_ref TEXT := _reference || '-VFDCHRG';
  _did_discount BOOLEAN := false;
  _did_charge BOOLEAN := false;
  _res JSONB;
BEGIN
  IF _reference IS NULL OR _reference = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'reference required');
  END IF;

  SELECT id INTO _settlement_id FROM vestara_accounts WHERE is_system = true AND account_type = 'settlement';
  SELECT id INTO _revenue_id    FROM vestara_accounts WHERE is_system = true AND account_type = 'revenue';
  SELECT id INTO _charges_id    FROM vestara_accounts WHERE is_system = true AND account_type = 'vfd_charges_expense';
  IF _settlement_id IS NULL OR _revenue_id IS NULL OR _charges_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'System accounts missing');
  END IF;

  SELECT initiated_by INTO _initiated_by FROM vestara_transactions WHERE reference = _reference LIMIT 1;

  -- (a) Margin VFD kept back (face - actual bill debit) => real earned revenue.
  IF _discount > 0 AND NOT EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _disc_ref) THEN
    _res := vestara_post_transaction(
      'fee', _disc_ref, _discount, _initiated_by,
      jsonb_build_array(
        jsonb_build_object('account_id', _settlement_id, 'debit', _discount, 'credit', 0),
        jsonb_build_object('account_id', _revenue_id, 'debit', 0, 'credit', _discount)
      ),
      _metadata || jsonb_build_object(
        'source', 'bill_vfd_reconciliation', 'leg', 'biller_discount',
        'original_reference', _reference, 'face_amount', _face_amount, 'actual_debit', _actual_debit)
    );
    IF NOT COALESCE((_res->>'success')::boolean, false) THEN RETURN _res; END IF;
    _did_discount := true;
  END IF;

  -- (b) Bank CHRG deducted from the pool => real expense.
  IF _charge > 0 AND NOT EXISTS (SELECT 1 FROM vestara_transactions WHERE reference = _chrg_ref) THEN
    _res := vestara_post_transaction(
      'fee', _chrg_ref, _charge, _initiated_by,
      jsonb_build_array(
        jsonb_build_object('account_id', _charges_id, 'debit', _charge, 'credit', 0),
        jsonb_build_object('account_id', _settlement_id, 'debit', 0, 'credit', _charge)
      ),
      _metadata || jsonb_build_object(
        'source', 'bill_vfd_reconciliation', 'leg', 'vfd_charge',
        'original_reference', _reference)
    );
    IF NOT COALESCE((_res->>'success')::boolean, false) THEN RETURN _res; END IF;
    _did_charge := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'discount_posted', _did_discount, 'discount', _discount,
    'charge_posted', _did_charge, 'charge', _charge
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.vestara_bill_reconcile_vfd_debit(text, numeric, numeric, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vestara_bill_reconcile_vfd_debit(text, numeric, numeric, numeric, jsonb) TO service_role;