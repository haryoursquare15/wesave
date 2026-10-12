CREATE OR REPLACE FUNCTION public.set_own_withdrawal_bank(_bank_code text, _bank_name text, _account_number text, _account_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _meta jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _account_number !~ '^\d{10}$' THEN RAISE EXCEPTION 'Account number must be 10 digits'; END IF;
  IF coalesce(trim(_bank_code),'') = '' OR coalesce(trim(_bank_name),'') = '' OR coalesce(trim(_account_name),'') = '' THEN
    RAISE EXCEPTION 'Bank and verified account name are required';
  END IF;
  SELECT coalesce(metadata,'{}'::jsonb) INTO _meta FROM vfd_sandbox_clients WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF _meta ? 'withdrawal_bank' AND coalesce(_meta->'withdrawal_bank'->>'account_number','') <> '' THEN
    RAISE EXCEPTION 'Withdrawal bank is already set. Contact support to change it.';
  END IF;
  _meta := _meta || jsonb_build_object('withdrawal_bank', jsonb_build_object(
    'bank_code', left(_bank_code,20), 'bank_name', left(_bank_name,120),
    'account_number', _account_number, 'account_name', left(_account_name,120),
    'set_at', now()));
  -- backend role bypasses the metadata guard
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  UPDATE vfd_sandbox_clients SET metadata = _meta, updated_at = now() WHERE user_id = _uid;
  RETURN _meta->'withdrawal_bank';
END $$;
REVOKE ALL ON FUNCTION public.set_own_withdrawal_bank(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_withdrawal_bank(text,text,text,text) TO authenticated;