
DROP FUNCTION IF EXISTS public.process_split_payment(uuid, uuid, numeric);

CREATE FUNCTION public.process_split_payment(
  _split_request_id uuid,
  _user_id uuid,
  _amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet_id uuid;
  _balance numeric;
  _ledger_id uuid;
  _participant_id uuid;
  _request_status text;
  _participant_status text;
  _all_paid boolean;
  _platform_fee numeric;
  _fee_per_person numeric;
  _total_debit numeric;
  _num_people integer;
BEGIN
  SELECT status, platform_fee, number_of_people INTO _request_status, _platform_fee, _num_people
  FROM split_requests WHERE id = _split_request_id;
  
  IF _request_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split request not found');
  END IF;
  IF _request_status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split request is not active');
  END IF;

  SELECT id, status INTO _participant_id, _participant_status
  FROM split_participants
  WHERE split_request_id = _split_request_id AND user_id = _user_id;
  
  IF _participant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a participant');
  END IF;
  IF _participant_status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already paid');
  END IF;
  IF _participant_status = 'declined' THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have declined this split');
  END IF;

  _fee_per_person := CEIL((_platform_fee / _num_people) * 100) / 100;
  _total_debit := _amount + _fee_per_person;

  SELECT id, available_balance INTO _wallet_id, _balance
  FROM wallets WHERE user_id = _user_id FOR UPDATE;
  
  IF _wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  IF _balance < _total_debit THEN
    RETURN jsonb_build_object('success', false, 'error', 
      format('Insufficient balance. Need ₦%s (₦%s share + ₦%s platform fee)', _total_debit, _amount, _fee_per_person));
  END IF;

  UPDATE wallets SET available_balance = available_balance - _total_debit, updated_at = now()
  WHERE id = _wallet_id;

  INSERT INTO ledger_entries (wallet_id, user_id, amount, entry_type, reference_type, reference_id,
    balance_before, balance_after, description)
  VALUES (_wallet_id, _user_id, _total_debit, 'debit', 'split_payment', _split_request_id::text,
    _balance, _balance - _total_debit, format('SplitPay: ₦%s share + ₦%s fee', _amount, _fee_per_person))
  RETURNING id INTO _ledger_id;

  INSERT INTO split_transactions (split_request_id, user_id, amount, wallet_ledger_id, status)
  VALUES (_split_request_id, _user_id, _amount, _ledger_id, 'completed');

  IF _fee_per_person > 0 THEN
    INSERT INTO platform_ledger (amount, entry_type, source_type, source_id, source_user_id,
      balance_before, balance_after, description)
    VALUES (_fee_per_person, 'fee_collected', 'split_payment', _split_request_id::text, _user_id,
      COALESCE((SELECT available_balance FROM platform_wallet WHERE wallet_type = 'revenue' LIMIT 1), 0),
      COALESCE((SELECT available_balance FROM platform_wallet WHERE wallet_type = 'revenue' LIMIT 1), 0) + _fee_per_person,
      'SplitPay platform fee');

    UPDATE platform_wallet SET available_balance = available_balance + _fee_per_person,
      total_collected = total_collected + _fee_per_person, updated_at = now()
    WHERE wallet_type = 'revenue';
  END IF;

  UPDATE split_participants SET status = 'paid', paid_at = now()
  WHERE id = _participant_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM split_participants
    WHERE split_request_id = _split_request_id AND status NOT IN ('paid', 'declined')
  ) INTO _all_paid;

  IF _all_paid THEN
    UPDATE split_requests SET status = 'completed', updated_at = now()
    WHERE id = _split_request_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
