-- card_tokens: remove unrestricted self-update (financial fields). Managed by service-role edge functions.
DROP POLICY IF EXISTS "Users can update own card tokens" ON public.card_tokens;
REVOKE UPDATE ON public.card_tokens FROM authenticated;

-- split_participants: remove unrestricted self-update. Status/amount transitions handled by
-- SECURITY DEFINER RPCs (process_split_payment, decline_split_participation, etc.)
DROP POLICY IF EXISTS "Participant can update own status" ON public.split_participants;
REVOKE UPDATE ON public.split_participants FROM authenticated;

-- target_ajo_member_contributions: totals must be derived server-side by
-- process_target_ajo_contribution (SECURITY DEFINER), never written by the client.
DROP POLICY IF EXISTS "Contributors can update own contribution" ON public.target_ajo_member_contributions;
DROP POLICY IF EXISTS "Contributors can upsert own contribution" ON public.target_ajo_member_contributions;
REVOKE INSERT, UPDATE ON public.target_ajo_member_contributions FROM authenticated;

GRANT ALL ON public.card_tokens TO service_role;
GRANT ALL ON public.split_participants TO service_role;
GRANT ALL ON public.target_ajo_member_contributions TO service_role;