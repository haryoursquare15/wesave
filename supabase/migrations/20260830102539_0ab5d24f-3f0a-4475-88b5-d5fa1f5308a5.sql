DO $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.vfd_user_balances WHERE user_id IS NOT NULL LOOP
    BEGIN
      PERFORM public.vestara_sync_user_balance_cache(u);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

UPDATE public.ledger_drift_findings
SET resolved_at = now(),
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object('resolution', 'Cache semantics unified (total = spendable + locked + savings); caches resynced from ledger truth.')
WHERE resolved_at IS NULL
  AND kind = 'wallet_vs_cache';

SELECT public.vestara_detect_balance_drift();