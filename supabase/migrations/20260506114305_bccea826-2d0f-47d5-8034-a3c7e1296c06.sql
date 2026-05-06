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

  -- Get-or-create the thrift pool account idempotently (handles concurrent calls)
  SELECT id INTO _pool_id FROM vestara_accounts
    WHERE account_type = 'thrift_pool' AND group_ref = _group_id LIMIT 1;

  IF _pool_id IS NULL THEN
    INSERT INTO vestara_accounts (user_id, account_type, group_ref, label)
    VALUES (NULL, 'thrift_pool', _group_id, 'Thrift Pool')
    ON CONFLICT ON CONSTRAINT vestara_accounts_unique_thrift_pool DO NOTHING
    RETURNING id INTO _pool_id;

    IF _pool_id IS NULL THEN
      SELECT id INTO _pool_id FROM vestara_accounts
        WHERE account_type = 'thrift_pool' AND group_ref = _group_id LIMIT 1;
    END IF;
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