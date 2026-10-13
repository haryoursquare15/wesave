
-- ===== Vestara Insights: Step 2 (new tables, views, RLS). Read-only w.r.t. money. =====

CREATE TABLE public.insight_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_scores (
  user_id uuid PRIMARY KEY,
  score int NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  save_score int NOT NULL DEFAULT 0 CHECK (save_score BETWEEN 0 AND 100),
  circle_score int NOT NULL DEFAULT 0 CHECK (circle_score BETWEEN 0 AND 100),
  grow_score int NOT NULL DEFAULT 0 CHECK (grow_score BETWEEN 0 AND 100),
  pay_score int NOT NULL DEFAULT 0 CHECK (pay_score BETWEEN 0 AND 100),
  level smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  xp int NOT NULL DEFAULT 0,
  previous_score int,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month date NOT NULL,
  score int NOT NULL,
  save_score int NOT NULL,
  circle_score int NOT NULL,
  grow_score int NOT NULL,
  pay_score int NOT NULL,
  level smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

CREATE TABLE public.user_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rule_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('warning','win','tip')),
  title text NOT NULL,
  body text NOT NULL,
  action_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','dismissed','acted')),
  cooldown_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_insights_user ON public.user_insights (user_id, created_at DESC);
CREATE INDEX idx_user_insights_rule ON public.user_insights (rule_id, status);

CREATE TABLE public.quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  pillar text NOT NULL CHECK (pillar IN ('save','circle','grow','pay')),
  target_value numeric NOT NULL DEFAULT 1,
  reward_xp int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  period text NOT NULL DEFAULT 'weekly' CHECK (period IN ('weekly')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  progress numeric NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_id, week_start)
);

CREATE TABLE public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  pillar text CHECK (pillar IN ('save','circle','grow','pay','overall')),
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

CREATE TABLE public.user_streaks (
  user_id uuid PRIMARY KEY,
  current_weeks int NOT NULL DEFAULT 0,
  best_weeks int NOT NULL DEFAULT 0,
  last_qualifying_week date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.insight_preferences (
  user_id uuid PRIMARY KEY,
  insights_enabled boolean NOT NULL DEFAULT true,
  nudges_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  available_balance numeric NOT NULL DEFAULT 0,
  locked_balance numeric NOT NULL DEFAULT 0,
  savings_balance numeric NOT NULL DEFAULT 0,
  is_backfilled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

-- ===== GRANTS =====
GRANT SELECT ON public.insight_config, public.quests, public.badges TO authenticated;
GRANT SELECT ON public.user_scores, public.user_score_history, public.user_quests,
  public.user_badges, public.user_streaks, public.user_balance_snapshots TO authenticated;
GRANT SELECT, UPDATE ON public.user_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.insight_preferences TO authenticated;
GRANT ALL ON public.insight_config, public.user_scores, public.user_score_history, public.user_insights,
  public.quests, public.user_quests, public.badges, public.user_badges, public.user_streaks,
  public.insight_preferences, public.user_balance_snapshots TO service_role;

-- ===== RLS =====
ALTER TABLE public.insight_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read insight config" ON public.insight_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read quests" ON public.quests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read badges" ON public.badges FOR SELECT TO authenticated USING (true);

CREATE POLICY "Own scores" ON public.user_scores FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own score history" ON public.user_score_history FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own quests" ON public.user_quests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own badges" ON public.user_badges FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own streaks" ON public.user_streaks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own balance snapshots" ON public.user_balance_snapshots FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own insights read" ON public.user_insights FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own preferences read" ON public.insight_preferences FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own preferences insert" ON public.insight_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own preferences update" ON public.insight_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Users may only change the status of their own insight (seen/dismissed/acted); everything else is locked.
REVOKE UPDATE ON public.user_insights FROM authenticated;
GRANT UPDATE (status, updated_at) ON public.user_insights TO authenticated;
CREATE POLICY "Own insights status update" ON public.user_insights FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND status IN ('seen','dismissed','acted'));

-- ===== Normalized read-only views (service role only; scoring reads ONLY these) =====

CREATE VIEW public.insights_eligible_users WITH (security_invoker = true) AS
SELECT c.user_id
FROM public.vfd_sandbox_clients c
WHERE c.user_id IS NOT NULL
  AND c.account_status = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = c.user_id AND r.role <> 'user')
  AND coalesce((c.metadata->>'is_test')::boolean, false) = false
  AND coalesce(c.metadata->>'account_kind','') NOT IN ('corporate','pool');

CREATE VIEW public.insights_external_inflow WITH (security_invoker = true) AS
SELECT t.id AS source_id, t.user_id, t.amount, coalesce(t.committed_at, t.created_at) AS occurred_at, t.description
FROM public.vfd_sandbox_transactions t
JOIN public.insights_eligible_users u ON u.user_id = t.user_id
WHERE t.transaction_type = 'credit' AND t.status = 'completed' AND t.amount > 0
  AND coalesce(t.description,'') !~* '(refund|revers|reimburs|interest|matur|payout|investment re|from wesave ng ltd|savings|lockmax|vault|goalsave|upfront)';

CREATE VIEW public.insights_bill_payments WITH (security_invoker = true) AS
SELECT b.id AS source_id, b.user_id, b.amount,
  CASE WHEN b.category ILIKE 'airtime%' THEN 'airtime'
       WHEN b.category ILIKE 'data%' OR b.category ILIKE 'internet%' THEN 'data'
       WHEN b.category ILIKE 'utility%' OR b.category ILIKE '%electric%' THEN 'electricity'
       WHEN b.category ILIKE 'cable%' THEN 'cable_tv'
       WHEN b.category ILIKE '%betting%' OR b.category ILIKE '%gaming%' THEN 'betting'
       ELSE 'other' END AS category,
  b.biller_name, b.recurring_bill_id, (b.recurring_bill_id IS NOT NULL) AS is_recurring,
  coalesce(b.paid_at, b.settled_at, b.created_at) AS occurred_at
FROM public.vfd_sandbox_bill_receipts b
JOIN public.insights_eligible_users u ON u.user_id = b.user_id
WHERE b.status = 'completed';

CREATE VIEW public.insights_recurring_bill_status WITH (security_invoker = true) AS
SELECT r.id AS recurring_bill_id, r.user_id, r.category, r.frequency, r.status, r.amount,
  r.next_run_at, r.last_run_at, r.last_run_status, r.consecutive_failures,
  (r.status = 'active' AND (r.last_run_status = 'failed' OR r.consecutive_failures > 0
     OR r.next_run_at < now() - interval '1 day')) AS is_late
FROM public.vfd_sandbox_recurring_bills r
JOIN public.insights_eligible_users u ON u.user_id = r.user_id;

CREATE VIEW public.insights_split_settlements WITH (security_invoker = true) AS
SELECT p.id AS source_id, p.user_id, p.amount_due AS amount, p.status, p.created_at AS requested_at, p.paid_at,
  CASE WHEN p.paid_at IS NOT NULL THEN extract(epoch FROM (p.paid_at - p.created_at))/3600.0 END AS hours_to_settle,
  'split_pay'::text AS source
FROM public.split_participants p JOIN public.insights_eligible_users u ON u.user_id = p.user_id
UNION ALL
SELECT p.id, p.user_id, p.amount, p.status, p.created_at, p.paid_at,
  CASE WHEN p.paid_at IS NOT NULL THEN extract(epoch FROM (p.paid_at - p.created_at))/3600.0 END,
  'wallet_split'::text
FROM public.vfd_sandbox_split_participants p JOIN public.insights_eligible_users u ON u.user_id = p.user_id;

CREATE VIEW public.insights_savings_deposits WITH (security_invoker = true) AS
SELECT s.id AS source_id, s.user_id, s.id AS savings_id, s.product_code::text AS product_code,
  coalesce(s.original_principal, s.principal) AS amount,
  coalesce(s.subaccount_funded_at, s.start_date, s.created_at) AS occurred_at
FROM public.vestara_savings s JOIN public.insights_eligible_users u ON u.user_id = s.user_id
WHERE s.approval_status = 'approved' AND s.product_code <> 'goalsave'
UNION ALL
SELECT d.id, d.user_id, d.savings_id, 'goalsave', d.amount, coalesce(d.collected_at, d.updated_at)
FROM public.vfd_savings_debit_schedule d
JOIN public.vestara_savings s ON s.id = d.savings_id AND s.approval_status = 'approved'
JOIN public.insights_eligible_users u ON u.user_id = d.user_id
WHERE d.status = 'succeeded';

CREATE VIEW public.insights_savings_withdrawals WITH (security_invoker = true) AS
SELECT s.id AS savings_id, s.user_id, s.product_code::text AS product_code,
  coalesce(s.principal,0) + coalesce(s.accrued_interest,0) AS amount,
  coalesce(s.penalty_amount,0) AS penalty_amount,
  (coalesce(s.penalty_amount,0) > 0) AS is_early_withdrawal,
  coalesce(s.withdrawn_at, s.matured_at) AS occurred_at
FROM public.vestara_savings s JOIN public.insights_eligible_users u ON u.user_id = s.user_id
WHERE s.approval_status = 'approved' AND coalesce(s.withdrawn_at, s.matured_at) IS NOT NULL;

CREATE VIEW public.insights_savings_holdings WITH (security_invoker = true) AS
SELECT s.id AS savings_id, s.user_id, s.product_code::text AS product_code, s.status::text AS status,
  s.principal, s.accrued_interest, s.user_rate, s.tenor_days, s.start_date, s.maturity_date, s.matured_at
FROM public.vestara_savings s JOIN public.insights_eligible_users u ON u.user_id = s.user_id
WHERE s.approval_status = 'approved';

CREATE VIEW public.insights_thrift_contributions WITH (security_invoker = true) AS
SELECT c.id AS source_id, c.user_id, c.group_id, c.cycle_number, c.amount, c.created_at AS paid_at,
  cy.contribution_deadline,
  (cy.contribution_deadline IS NULL OR c.created_at <= cy.contribution_deadline) AS on_time
FROM public.vfd_sandbox_group_contributions c
JOIN public.insights_eligible_users u ON u.user_id = c.user_id
LEFT JOIN public.vfd_sandbox_contribution_cycles cy ON cy.group_id = c.group_id AND cy.cycle_number = c.cycle_number
WHERE c.status = 'completed';

CREATE VIEW public.insights_outflow_by_category WITH (security_invoker = true) AS
SELECT t.user_id, 'transfer'::text AS category, t.amount, coalesce(t.committed_at, t.created_at) AS occurred_at
FROM public.vfd_sandbox_transactions t JOIN public.insights_eligible_users u ON u.user_id = t.user_id
WHERE t.transaction_type = 'transfer' AND t.status = 'completed'
UNION ALL SELECT user_id, category, amount, occurred_at FROM public.insights_bill_payments
UNION ALL SELECT user_id, 'split_pay', amount, paid_at FROM public.insights_split_settlements WHERE status = 'paid'
UNION ALL SELECT user_id, 'savings', amount, occurred_at FROM public.insights_savings_deposits
UNION ALL SELECT user_id, 'thrift', amount, paid_at FROM public.insights_thrift_contributions;

-- Views are not client-facing: only the service-role scoring engine reads them.
REVOKE ALL ON public.insights_eligible_users, public.insights_external_inflow, public.insights_bill_payments,
  public.insights_recurring_bill_status, public.insights_split_settlements, public.insights_savings_deposits,
  public.insights_savings_withdrawals, public.insights_savings_holdings, public.insights_thrift_contributions,
  public.insights_outflow_by_category FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.insights_eligible_users, public.insights_external_inflow, public.insights_bill_payments,
  public.insights_recurring_bill_status, public.insights_split_settlements, public.insights_savings_deposits,
  public.insights_savings_withdrawals, public.insights_savings_holdings, public.insights_thrift_contributions,
  public.insights_outflow_by_category TO service_role;

-- ===== Balance snapshots: nightly job + one-time 30-day backfill =====
CREATE OR REPLACE FUNCTION public.insights_snapshot_balances()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.user_balance_snapshots (user_id, snapshot_date, available_balance, locked_balance, savings_balance, is_backfilled)
  SELECT b.user_id, (now() AT TIME ZONE 'Africa/Lagos')::date,
         coalesce(b.available_balance,0), coalesce(b.locked_balance,0), coalesce(b.savings_balance,0), false
  FROM public.vfd_user_balances b JOIN public.insights_eligible_users u ON u.user_id = b.user_id
  ON CONFLICT (user_id, snapshot_date) DO UPDATE
    SET available_balance = EXCLUDED.available_balance, locked_balance = EXCLUDED.locked_balance,
        savings_balance = EXCLUDED.savings_balance, is_backfilled = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.insights_backfill_balance_snapshots(p_days integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; today date := (now() AT TIME ZONE 'Africa/Lagos')::date;
BEGIN
  INSERT INTO public.user_balance_snapshots (user_id, snapshot_date, available_balance, locked_balance, savings_balance, is_backfilled)
  SELECT b.user_id, d.day,
    greatest(0, coalesce(b.available_balance,0) - coalesce((
      SELECT sum(CASE WHEN t.transaction_type = 'credit' THEN t.amount ELSE -t.amount END)
      FROM public.vfd_sandbox_transactions t
      WHERE t.user_id = b.user_id AND t.status = 'completed'
        AND coalesce(t.committed_at, t.created_at) >= ((d.day + 1)::timestamp AT TIME ZONE 'Africa/Lagos')
    ),0)),
    coalesce(b.locked_balance,0), coalesce(b.savings_balance,0), true
  FROM public.vfd_user_balances b
  JOIN public.insights_eligible_users u ON u.user_id = b.user_id
  CROSS JOIN LATERAL (SELECT (today - g)::date AS day FROM generate_series(1, p_days) g) d
  ON CONFLICT (user_id, snapshot_date) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.insights_snapshot_balances() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.insights_backfill_balance_snapshots(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insights_snapshot_balances() TO service_role;
GRANT EXECUTE ON FUNCTION public.insights_backfill_balance_snapshots(integer) TO service_role;

-- 23:30 UTC = 00:30 WAT is VFD EOD window; run at 23:45 WAT (22:45 UTC) instead.
SELECT cron.schedule('insights-balance-snapshot-nightly', '45 22 * * *', $$SELECT public.insights_snapshot_balances();$$);
