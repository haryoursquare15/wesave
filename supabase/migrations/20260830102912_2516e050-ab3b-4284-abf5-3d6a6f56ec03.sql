CREATE OR REPLACE FUNCTION public.vestara_detect_balance_drift()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _found INT := 0;
  _rec RECORD;
BEGIN
  UPDATE ledger_drift_findings SET resolved_at = now() WHERE resolved_at IS NULL;

  -- Check 1: each account's balance must equal the sum of its ledger entries.
  FOR _rec IN
    SELECT a.id, a.user_id, a.account_type::text AS atype, a.balance,
           COALESCE(SUM(l.credit - l.debit), 0) AS ledger_sum
    FROM vestara_accounts a
    LEFT JOIN vestara_ledger_entries l ON l.account_id = a.id
    GROUP BY a.id
    HAVING ABS(a.balance - COALESCE(SUM(l.credit - l.debit), 0)) > 0.01
  LOOP
    INSERT INTO ledger_drift_findings (kind, account_id, user_id, account_type, expected, actual, delta, details)
    VALUES ('account_vs_ledger', _rec.id, _rec.user_id, _rec.atype,
            _rec.ledger_sum, _rec.balance, _rec.balance - _rec.ledger_sum,
            jsonb_build_object('description', 'Account balance does not match its ledger history'));
    _found := _found + 1;
  END LOOP;

  -- Check 2: SPENDABLE cache must mirror the wallet ledger account.
  FOR _rec IN
    SELECT a.user_id, a.id, a.balance,
           COALESCE(b.available_balance, COALESCE(b.total_balance,0) - COALESCE(b.locked_balance,0), 0) AS cached
    FROM vestara_accounts a
    LEFT JOIN vfd_user_balances b ON b.user_id = a.user_id
    WHERE a.account_type = 'wallet' AND a.is_system = false AND a.user_id IS NOT NULL
      AND ABS(COALESCE(b.available_balance, COALESCE(b.total_balance,0) - COALESCE(b.locked_balance,0), 0) - a.balance) > 0.01
  LOOP
    INSERT INTO ledger_drift_findings (kind, account_id, user_id, account_type, expected, actual, delta, details)
    VALUES ('wallet_vs_cache', _rec.id, _rec.user_id, 'wallet',
            _rec.balance, _rec.cached, _rec.cached - _rec.balance,
            jsonb_build_object(
              'description', 'Displayed spendable balance does not match the wallet ledger account',
              'wallet_balance', _rec.balance,
              'cached_available', _rec.cached));
    _found := _found + 1;
  END LOOP;

  -- Check 3: cached locked_balance mirrors the sum of locked_savings accounts.
  FOR _rec IN
    SELECT u.user_id, u.locked_sum, COALESCE(b.locked_balance, 0) AS cached
    FROM (
      SELECT a.user_id, SUM(a.balance) AS locked_sum
      FROM vestara_accounts a
      WHERE a.account_type = 'locked_savings' AND a.is_system = false AND a.user_id IS NOT NULL
      GROUP BY a.user_id
    ) u
    LEFT JOIN vfd_user_balances b ON b.user_id = u.user_id
    WHERE ABS(COALESCE(b.locked_balance, 0) - u.locked_sum) > 0.01
  LOOP
    INSERT INTO ledger_drift_findings (kind, account_id, user_id, account_type, expected, actual, delta, details)
    VALUES ('locked_vs_cache', NULL, _rec.user_id, 'locked_savings',
            _rec.locked_sum, _rec.cached, _rec.cached - _rec.locked_sum,
            jsonb_build_object(
              'description', 'Displayed locked balance does not match locked savings accounts',
              'locked_accounts_sum', _rec.locked_sum,
              'cached_locked', _rec.cached));
    _found := _found + 1;
  END LOOP;

  -- Check 4: every funded savings plan must have bank proof that its money was
  -- actually swept from the corporate pool into the product sub-account.
  -- An internal lock posting is NOT proof that money moved.
  FOR _rec IN
    SELECT s.id, s.user_id, s.product_code::text AS pcode, s.principal,
           s.sub_account_nuban, s.sub_account_transfer_ref, s.subaccount_funded_at
    FROM vestara_savings s
    WHERE COALESCE(s.principal, 0) > 0
      AND s.status IN ('active', 'matured')
      AND COALESCE(s.approval_status, '') = 'approved'
      AND (s.sub_account_transfer_ref IS NULL OR s.sub_account_transfer_ref = ''
           OR s.subaccount_funded_at IS NULL)
  LOOP
    INSERT INTO ledger_drift_findings (kind, account_id, user_id, account_type, expected, actual, delta, details)
    VALUES ('savings_unfunded_subaccount', NULL, _rec.user_id, 'locked_savings',
            _rec.principal, 0, -_rec.principal,
            jsonb_build_object(
              'description', 'Savings plan holds principal with no VFD sub-account funding proof',
              'savings_id', _rec.id,
              'product_code', _rec.pcode,
              'principal', _rec.principal,
              'sub_account_nuban', _rec.sub_account_nuban,
              'sub_account_transfer_ref', _rec.sub_account_transfer_ref,
              'subaccount_funded_at', _rec.subaccount_funded_at));
    _found := _found + 1;
  END LOOP;

  RETURN jsonb_build_object('checked_at', now(), 'findings', _found);
END;
$function$;