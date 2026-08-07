DO $$
DECLARE
  res jsonb;
BEGIN
  SELECT public.vestara_withdraw(
    'df1ed473-7414-41cc-aa94-7b9831162df2'::uuid,
    999,
    'VFDIN-090110260807153654458220158371-DUPREV',
    jsonb_build_object(
      'source', 'duplicate_credit_reversal',
      'reason', 'Inflow webhook re-credited an intra-Vestara transfer already mirrored as VFD-1786113414087-89571bc6-IN',
      'original_reference', 'VFDIN-090110260807153654458220158371',
      'vfd_session_id', '090110260807153654458220158371'
    )
  ) INTO res;
  RAISE NOTICE 'reversal result: %', res;
END $$;

UPDATE public.vfd_sandbox_transactions
SET status = 'reversed',
    description = COALESCE(description, '') || ' (duplicate credit reversed)',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reversed', true, 'reversal_reference', 'VFDIN-090110260807153654458220158371-DUPREV')
WHERE reference = 'VFDIN-090110260807153654458220158371';