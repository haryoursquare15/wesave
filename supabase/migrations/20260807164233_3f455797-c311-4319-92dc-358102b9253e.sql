REVOKE EXECUTE ON FUNCTION public.vestara_sync_user_balance_cache(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vestara_post_transaction(vestara_tx_type, text, numeric, uuid, jsonb, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vestara_split_refund(uuid, uuid, numeric, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vestara_campaign_contribute(uuid, uuid, numeric, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vestara_campaign_withdraw(uuid, uuid, numeric, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vestara_target_payout(uuid, uuid, numeric, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vestara_detect_balance_drift() FROM anon, authenticated;