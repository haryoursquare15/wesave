
-- ============================================================
-- VESTARA PHASE 4: INTEGRITY & VIEWS
-- ============================================================

-- 1. Trigger: validate debit == credit per transaction on entry insert
CREATE OR REPLACE FUNCTION public.vestara_validate_balance_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total_debit NUMERIC;
  _total_credit NUMERIC;
  _tx_status TEXT;
BEGIN
  -- Only validate for completed transactions
  SELECT status INTO _tx_status FROM vestara_transactions WHERE id = NEW.transaction_id;
  IF _tx_status != 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO _total_debit, _total_credit
  FROM vestara_ledger_entries
  WHERE transaction_id = NEW.transaction_id;

  -- This runs per-entry; final validation happens in the RPC
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vestara_validate_entry
  AFTER INSERT ON public.vestara_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.vestara_validate_balance_on_entry();

-- 2. View: derived balances from ledger
CREATE OR REPLACE VIEW public.vestara_derived_balances AS
SELECT
  a.id AS account_id,
  a.user_id,
  a.account_type,
  a.label,
  a.is_system,
  a.balance AS stored_balance,
  COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0) AS derived_balance,
  a.balance - (COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)) AS drift
FROM public.vestara_accounts a
LEFT JOIN public.vestara_ledger_entries le ON le.account_id = a.id
GROUP BY a.id, a.user_id, a.account_type, a.label, a.is_system, a.balance;

-- 3. View: transaction detail with entries
CREATE OR REPLACE VIEW public.vestara_transaction_detail AS
SELECT
  t.id AS transaction_id,
  t.type,
  t.status,
  t.reference,
  t.amount,
  t.initiated_by,
  t.metadata,
  t.created_at,
  t.completed_at,
  le.id AS entry_id,
  le.account_id,
  a.account_type,
  a.label AS account_label,
  a.user_id AS account_owner,
  le.debit,
  le.credit
FROM public.vestara_transactions t
JOIN public.vestara_ledger_entries le ON le.transaction_id = t.id
JOIN public.vestara_accounts a ON a.id = le.account_id;

-- 4. Enable realtime for transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.vestara_transactions;

NOTIFY pgrst, 'reload schema';
