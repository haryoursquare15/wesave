-- Backfill missing otp_hash from legacy otp_code where needed, then drop plaintext column
UPDATE public.bank_change_otps SET otp_hash = encode(digest(otp_code, 'sha256'), 'hex')
WHERE otp_hash IS NULL AND otp_code IS NOT NULL;

ALTER TABLE public.bank_change_otps ALTER COLUMN otp_code DROP NOT NULL;
ALTER TABLE public.bank_change_otps DROP COLUMN otp_code;

-- Admin visibility for vestara_transactions for reconciliation (includes system rows with NULL initiated_by)
CREATE POLICY "Admins can view all vestara transactions"
ON public.vestara_transactions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'finance_admin'::app_role)
  OR public.has_role(auth.uid(), 'compliance_admin'::app_role)
);