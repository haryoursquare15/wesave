-- Gate legacy interest primitives on approval_status, mirroring
-- vestara_accrue_daily_interest. Both are reachable via the vestara-ledger
-- edge function actions accrue_interest / accrue_interest_batch / payout_interest.

CREATE OR REPLACE FUNCTION public.vestara_accrue_interest(
  _user_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _interest_expense_id UUID;
  _accrued_id UUID;
  _has_approved BOOLEAN;
BEGIN
  -- Approval gate: never accrue interest for a user whose savings contracts
  -- are all still pending admin approval (or rejected/cancelled).
  SELECT EXISTS (
    SELECT 1 FROM public.vestara_savings
     WHERE user_id = _user_id
       AND approval_status = 'approved'
       AND status = 'active'
  ) INTO _has_approved;

  IF NOT _has_approved THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No approved active savings contract — interest cannot accrue while placement is pending approval.',
      'code', 'ACCRUAL_NOT_APPROVED'
    );
  END IF;

  SELECT id INTO _interest_expense_id FROM vestara_accounts
    WHERE is_system = true AND account_type = 'interest_expense';

  _accrued_id := vestara_get_or_create_account(_user_id, 'accrued_interest', 'Accrued Interest');

  RETURN vestara_post_transaction(
    'interest_accrual', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _interest_expense_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _accrued_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.vestara_payout_interest(
  _user_id UUID,
  _amount NUMERIC,
  _reference TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _accrued_id UUID;
  _wallet_id UUID;
  _has_approved BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.vestara_savings
     WHERE user_id = _user_id
       AND approval_status = 'approved'
  ) INTO _has_approved;

  IF NOT _has_approved THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No approved savings contract — interest cannot be paid out.',
      'code', 'PAYOUT_NOT_APPROVED'
    );
  END IF;

  SELECT id INTO _accrued_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'accrued_interest' LIMIT 1;
  IF _accrued_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No accrued interest account');
  END IF;

  SELECT id INTO _wallet_id FROM vestara_accounts
    WHERE user_id = _user_id AND account_type = 'wallet' LIMIT 1;

  RETURN vestara_post_transaction(
    'interest_payout', _reference, _amount, _user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', _accrued_id, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', _wallet_id, 'debit', 0, 'credit', _amount)
    ),
    _metadata
  );
END;
$$;