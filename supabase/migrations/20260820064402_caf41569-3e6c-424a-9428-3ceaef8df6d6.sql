ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS internal_account boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.classify_revenue_source(_ref text, _meta jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(_meta->>'fee_type','') = 'splitpay_service_fee'
      OR coalesce(_meta->>'source','') ILIKE '%split%' THEN 'splitpay_service_fee'
    WHEN coalesce(_meta->>'leg','') = 'biller_discount'
      OR _ref ILIKE '%-VFDDISC' THEN 'biller_discount'
    WHEN coalesce(_meta->>'source','') = 'bill_payment_settle'
      OR (_meta ? 'convenience_fee')
      OR _ref ILIKE 'vestara-bill-%' THEN 'bills_convenience_fee'
    WHEN coalesce(_meta->>'fee_type','') ILIKE '%stamp%'
      OR coalesce(_meta->>'source','') ILIKE '%stamp%'
      OR _ref ILIKE '%STAMP%' THEN 'stamp_duty'
    WHEN coalesce(_meta->>'fee_type','') ILIKE '%transfer%'
      OR coalesce(_meta->>'source','') ILIKE '%transfer_fee%'
      OR _ref ILIKE '%-XFERFEE%' THEN 'transfer_fee'
    WHEN coalesce(_meta->>'fee_type','') ILIKE '%mandate%'
      OR coalesce(_meta->>'source','') ILIKE '%mandate%'
      OR _ref ILIKE '%MANDATE%' THEN 'mandate_setup_fee'
    WHEN coalesce(_meta->>'fee_type','') ILIKE '%penalt%'
      OR coalesce(_meta->>'source','') ILIKE '%early_with%'
      OR _ref ILIKE '%PENALT%' THEN 'early_withdrawal_penalty'
    ELSE 'other'
  END
$$;

CREATE OR REPLACE FUNCTION public.admin_get_revenue_breakdown(
  _start timestamptz DEFAULT NULL,
  _end timestamptz DEFAULT NULL,
  _include_internal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows jsonb;
  _total numeric := 0;
  _swept numeric := 0;
  _excluded numeric := 0;
BEGIN
  IF NOT public.is_any_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH rev AS (
    SELECT t.initiated_by AS user_id,
           public.classify_revenue_source(coalesce(t.reference,''), coalesce(t.metadata,'{}'::jsonb)) AS source,
           le.credit AS amount,
           coalesce(p.internal_account,false) AS internal
    FROM public.vestara_ledger_entries le
    JOIN public.vestara_accounts a ON a.id = le.account_id AND a.account_type = 'revenue'
    JOIN public.vestara_transactions t ON t.id = le.transaction_id
    LEFT JOIN public.profiles p ON p.id = t.initiated_by
    WHERE le.credit > 0
      AND (_start IS NULL OR t.created_at >= _start)
      AND (_end IS NULL OR t.created_at < _end)
  )
  SELECT
    coalesce(jsonb_agg(x ORDER BY (x->>'amount')::numeric DESC), '[]'::jsonb),
    coalesce(sum((x->>'amount')::numeric), 0)
  INTO _rows, _total
  FROM (
    SELECT jsonb_build_object('source', source, 'amount', sum(amount), 'count', count(*)) AS x
    FROM rev
    WHERE _include_internal OR NOT internal
    GROUP BY source
  ) s;

  SELECT coalesce(sum(amount), 0) INTO _excluded
  FROM (
    SELECT le.credit AS amount, coalesce(p.internal_account,false) AS internal
    FROM public.vestara_ledger_entries le
    JOIN public.vestara_accounts a ON a.id = le.account_id AND a.account_type = 'revenue'
    JOIN public.vestara_transactions t ON t.id = le.transaction_id
    LEFT JOIN public.profiles p ON p.id = t.initiated_by
    WHERE le.credit > 0
      AND (_start IS NULL OR t.created_at >= _start)
      AND (_end IS NULL OR t.created_at < _end)
  ) e
  WHERE internal;

  SELECT coalesce(sum(fs.amount), 0) INTO _swept
  FROM public.vfd_fee_sweeps fs
  LEFT JOIN public.profiles p ON p.id = fs.user_id
  WHERE fs.status = 'completed'
    AND (_start IS NULL OR fs.created_at >= _start)
    AND (_end IS NULL OR fs.created_at < _end)
    AND (_include_internal OR NOT coalesce(p.internal_account,false));

  RETURN jsonb_build_object(
    'total', _total,
    'sources', _rows,
    'excluded_internal_total', _excluded,
    'swept_total', _swept,
    'unswept_float', greatest(_total - _swept, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_revenue_entries(
  _start timestamptz DEFAULT NULL,
  _end timestamptz DEFAULT NULL,
  _source text DEFAULT NULL,
  _include_internal boolean DEFAULT false,
  _limit integer DEFAULT 200
)
RETURNS TABLE (
  transaction_id uuid,
  reference text,
  source text,
  amount numeric,
  user_id uuid,
  full_name text,
  username text,
  email text,
  internal_account boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_any_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT t.id,
         t.reference,
         public.classify_revenue_source(coalesce(t.reference,''), coalesce(t.metadata,'{}'::jsonb)),
         le.credit,
         t.initiated_by,
         p.full_name,
         p.username,
         p.email,
         coalesce(p.internal_account,false),
         t.created_at
  FROM public.vestara_ledger_entries le
  JOIN public.vestara_accounts a ON a.id = le.account_id AND a.account_type = 'revenue'
  JOIN public.vestara_transactions t ON t.id = le.transaction_id
  LEFT JOIN public.profiles p ON p.id = t.initiated_by
  WHERE le.credit > 0
    AND (_start IS NULL OR t.created_at >= _start)
    AND (_end IS NULL OR t.created_at < _end)
    AND (_include_internal OR NOT coalesce(p.internal_account,false))
    AND (_source IS NULL OR public.classify_revenue_source(coalesce(t.reference,''), coalesce(t.metadata,'{}'::jsonb)) = _source)
  ORDER BY t.created_at DESC
  LIMIT coalesce(_limit, 200);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_revenue_breakdown(timestamptz, timestamptz, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_list_revenue_entries(timestamptz, timestamptz, text, boolean, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_revenue_breakdown(timestamptz, timestamptz, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_revenue_entries(timestamptz, timestamptz, text, boolean, integer) TO authenticated, service_role;