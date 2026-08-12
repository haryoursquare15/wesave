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

  FOR _rec IN
    SELECT a.user_id, a.id, a.balance,
           COALESCE(b.total_balance, 0)   AS cached,
           COALESCE(b.locked_balance, 0)  AS locked,
           COALESCE(b.savings_balance, 0) AS savings,
           a.balance + COALESCE(b.locked_balance, 0) + COALESCE(b.savings_balance, 0) AS expected_total
    FROM vestara_accounts a
    LEFT JOIN vfd_user_balances b ON b.user_id = a.user_id
    WHERE a.account_type = 'wallet' AND a.is_system = false
      AND ABS(COALESCE(b.total_balance, 0) - a.balance
              - COALESCE(b.locked_balance, 0) - COALESCE(b.savings_balance, 0)) > 0.01
  LOOP
    INSERT INTO ledger_drift_findings (kind, account_id, user_id, account_type, expected, actual, delta, details)
    VALUES ('wallet_vs_cache', _rec.id, _rec.user_id, 'wallet',
            _rec.expected_total, _rec.cached, _rec.cached - _rec.expected_total,
            jsonb_build_object(
              'description', 'Displayed balance does not match wallet + locked + savings',
              'wallet_balance', _rec.balance,
              'locked_balance', _rec.locked,
              'savings_balance', _rec.savings,
              'cached_total', _rec.cached));
    _found := _found + 1;
  END LOOP;

  RETURN jsonb_build_object('checked_at', now(), 'findings', _found);
END;
$function$;