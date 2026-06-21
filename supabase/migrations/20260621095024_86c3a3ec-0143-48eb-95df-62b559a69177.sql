-- Remove broad admin SELECT on vfd_sandbox_clients which exposed plaintext BVN/NIN/phone
-- to compliance/finance/super admins for all customers. Admins should access masked PII
-- via the audited encryption-utils edge function, not by directly SELECTing the table.
DROP POLICY IF EXISTS "Compliance and finance admins can view VFD clients" ON public.vfd_sandbox_clients;