-- CRITICAL SECURITY FIX: Restrict wallet manipulation functions to service_role only
-- These SECURITY DEFINER functions bypass RLS and should NOT be callable from clients

-- Revoke execute from public (anonymous) and authenticated users
REVOKE EXECUTE ON FUNCTION public.credit_wallet_atomic(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_wallet_atomic(UUID, NUMERIC, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_wallet_atomic(UUID, NUMERIC, TEXT, TEXT) FROM anon;

REVOKE EXECUTE ON FUNCTION public.debit_wallet_via_ledger(UUID, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debit_wallet_via_ledger(UUID, NUMERIC, TEXT, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_wallet_via_ledger(UUID, NUMERIC, TEXT, UUID, TEXT) FROM anon;

REVOKE EXECUTE ON FUNCTION public.credit_wallet_via_ledger(UUID, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_wallet_via_ledger(UUID, NUMERIC, TEXT, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_wallet_via_ledger(UUID, NUMERIC, TEXT, UUID, TEXT) FROM anon;

-- Grant execute only to service_role (used by edge functions)
GRANT EXECUTE ON FUNCTION public.credit_wallet_atomic(UUID, NUMERIC, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_wallet_via_ledger(UUID, NUMERIC, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_wallet_via_ledger(UUID, NUMERIC, TEXT, UUID, TEXT) TO service_role;