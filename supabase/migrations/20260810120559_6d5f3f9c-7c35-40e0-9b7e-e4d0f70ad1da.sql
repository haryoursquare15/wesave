CREATE OR REPLACE FUNCTION public.vestara_bill_settle(_reference text, _metadata jsonb DEFAULT '{}'::jsonb, _fee_amount numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _hold_tx RECORD;
  _hold_id UUID;
  _settlement_id UUID;
  _revenue_id UUID;
  _new_ref TEXT := _reference || '-SETTLE';
  _fee NUMERIC;
  _bill NUMERIC;
  _legs JSONB;
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
  SELECT id INTO _revenue_id FROM vestara_accounts WHERE is_system = true AND account_type = 'revenue';
  IF _hold_id IS NULL OR _settlement_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'System accounts missing');
  END IF;

  -- Fix D: the hold covers bill amount + convenience fee. Only the bill amount
  -- corresponds to real bank movement at the pool; the fee is Vestara revenue
  -- and gets its own explicit leg instead of being absorbed into settlement.
  _fee := round(COALESCE(_fee_amount, (_hold_tx.metadata->>'convenience_fee')::numeric, 0), 2);
  IF _fee IS NULL OR _fee < 0 THEN _fee := 0; END IF;
  IF _fee > _hold_tx.amount THEN _fee := 0; END IF;
  IF _fee > 0 AND _revenue_id IS NULL THEN _fee := 0; END IF;
  _bill := round(_hold_tx.amount - _fee, 2);

  _legs := jsonb_build_array(
    jsonb_build_object('account_id', _hold_id, 'debit', _hold_tx.amount, 'credit', 0),
    jsonb_build_object('account_id', _settlement_id, 'debit', 0, 'credit', _bill)
  );
  IF _fee > 0 THEN
    _legs := _legs || jsonb_build_array(
      jsonb_build_object('account_id', _revenue_id, 'debit', 0, 'credit', _fee)
    );
  END IF;

  RETURN vestara_post_transaction(
    'transfer', _new_ref, _hold_tx.amount, _hold_tx.initiated_by,
    _legs,
    _metadata || jsonb_build_object(
      'source', 'bill_payment_settle',
      'original_reference', _reference,
      'bill_amount', _bill,
      'convenience_fee', _fee)
  );
END;
$function$;