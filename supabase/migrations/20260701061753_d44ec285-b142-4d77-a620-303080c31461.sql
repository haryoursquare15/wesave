-- Return the 3000 in locked_savings back to wallet for test8, then remove test rows
WITH u AS (SELECT '7220437f-e4ba-42a4-8e5d-479b5589de0a'::uuid AS uid)
UPDATE public.vestara_accounts SET balance = balance + 3000, updated_at = now()
WHERE user_id = (SELECT uid FROM u) AND account_type = 'wallet';

UPDATE public.vestara_accounts SET balance = 0, updated_at = now()
WHERE id IN ('90ea3e80-94e6-4f26-b847-dcd3034c2b40','086e4a1a-20ce-4e75-8be8-57e838851f77');

DELETE FROM public.vestara_ledger_entries
WHERE transaction_id IN (SELECT id FROM public.vestara_transactions WHERE reference LIKE 'test-e2e-%' OR reference LIKE 'vestara-savings-%-e4a27f0d%' OR reference LIKE 'vestara-savings-%-0e4190ae%');
DELETE FROM public.vestara_transactions
WHERE reference LIKE 'test-e2e-%' OR reference LIKE 'vestara-savings-%-e4a27f0d%' OR reference LIKE 'vestara-savings-%-0e4190ae%';
DELETE FROM public.vestara_savings WHERE id IN ('e4a27f0d-cd59-46c9-8010-2b8c2f0f4ad3','0e4190ae-fbcd-403c-8bdc-eefa801df3c7');
DELETE FROM public.vestara_accounts WHERE id IN ('90ea3e80-94e6-4f26-b847-dcd3034c2b40','086e4a1a-20ce-4e75-8be8-57e838851f77');
-- Also remove empty locked_savings shells if created with 0 balance
DELETE FROM public.vestara_accounts a
WHERE a.user_id = '7220437f-e4ba-42a4-8e5d-479b5589de0a'
  AND a.account_type = 'locked_savings'
  AND a.balance = 0
  AND NOT EXISTS (SELECT 1 FROM public.vestara_savings s WHERE s.lock_account_id = a.id);