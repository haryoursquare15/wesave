CREATE SCHEMA IF NOT EXISTS ledger_snapshots;
REVOKE ALL ON SCHEMA ledger_snapshots FROM PUBLIC, anon, authenticated;
CREATE TABLE ledger_snapshots.vestara_accounts_20261012 AS SELECT * FROM public.vestara_accounts;
CREATE TABLE ledger_snapshots.vestara_ledger_entries_20261012 AS SELECT * FROM public.vestara_ledger_entries;
CREATE TABLE ledger_snapshots.vestara_transactions_20261012 AS SELECT * FROM public.vestara_transactions;
CREATE TABLE ledger_snapshots.vfd_user_balances_20261012 AS SELECT * FROM public.vfd_user_balances;
CREATE TABLE ledger_snapshots.wallets_20261012 AS SELECT * FROM public.wallets;
REVOKE ALL ON ALL TABLES IN SCHEMA ledger_snapshots FROM PUBLIC, anon, authenticated;
COMMENT ON SCHEMA ledger_snapshots IS 'Read-only pre-correction snapshots (INC-20261012). Do not modify.';