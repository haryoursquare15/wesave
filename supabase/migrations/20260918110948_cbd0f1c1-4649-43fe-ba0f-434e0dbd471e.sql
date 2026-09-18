DROP FUNCTION IF EXISTS public.spendlock_get_insights();

CREATE OR REPLACE FUNCTION public.spendlock_resolve_suggestion(_suggestion_id uuid, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid();
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _status NOT IN ('accepted','dismissed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.budget_suggestions SET status = _status
   WHERE id = _suggestion_id AND user_id = u AND status = 'pending';
  RETURN public.spendlock_get_insights((current_date - 89), current_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.spendlock_update_bill(_bill_id uuid, _status text DEFAULT NULL, _label text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid();
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _status IS NOT NULL AND _status NOT IN ('suggested','confirmed','dismissed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  UPDATE public.detected_bills
     SET status = COALESCE(_status, status),
         label = COALESCE(_label, label)
   WHERE id = _bill_id AND user_id = u;
  RETURN public.spendlock_get_insights((current_date - 89), current_date);
END;
$$;

REVOKE ALL ON FUNCTION public.spendlock_resolve_suggestion(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.spendlock_update_bill(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.spendlock_resolve_suggestion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spendlock_update_bill(uuid, text, text) TO authenticated;