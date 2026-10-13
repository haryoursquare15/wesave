CREATE OR REPLACE FUNCTION public.cancel_pending_savings_plan(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.vestara_savings%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.vestara_savings WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;
  IF v_plan.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only cancel your own plan';
  END IF;
  -- Only cancellable before the plan is concluded: awaiting review, or bank authorization not yet completed.
  IF NOT (
    v_plan.approval_status = 'pending'
    OR (v_plan.activation_status = 'pending_mandate'
        AND COALESCE(v_plan.mandate_status, '') NOT IN ('active', 'approved', 'authorized', 'live'))
  ) THEN
    RAISE EXCEPTION 'This plan can no longer be cancelled';
  END IF;
  UPDATE public.vestara_savings
  SET status = 'cancelled',
      mandate_status = CASE WHEN COALESCE(mandate_status, '') IN ('pending', 'initiated', '') THEN 'cancelled' ELSE mandate_status END,
      updated_at = now()
  WHERE id = p_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pending_savings_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_pending_savings_plan(uuid) TO authenticated;