
CREATE OR REPLACE FUNCTION public.insights_compute_user(p_user uuid, p_dry_run boolean DEFAULT false, p_run_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tz constant text := 'Africa/Lagos';
  v_now timestamptz := now();
  v_today date := (now() AT TIME ZONE tz)::date;
  v_week date := date_trunc('week', now() AT TIME ZONE tz)::date;
  v_week_ts timestamptz;
  v_month date := date_trunc('month', now() AT TIME ZONE tz)::date;
  c_idle_days numeric := insights_cfg_num('idle_wallet_threshold_days', 14);
  c_idle_min numeric := insights_cfg_num('idle_min_amount', 20000);
  c_share_th numeric := insights_cfg_num('airtime_data_share_threshold', 0.07);
  c_spike numeric := insights_cfg_num('inflow_spike_threshold', 0.20);
  c_neutral numeric := insights_cfg_num('neutral_pillar_score', 50);
  c_weights jsonb := coalesce((SELECT value FROM insight_config WHERE key='pillar_weights'), '{"save":35,"circle":25,"grow":25,"pay":15}');
  c_levels jsonb := (SELECT value FROM insight_config WHERE key='level_thresholds');
  v_created timestamptz; v_state text := 'active';
  in30 numeric; inprev numeric; in90 numeric; in_ever boolean; avg_month numeric;
  dep30 numeric; wd30 numeric; dep_ever int; q_weeks int; early90 int;
  v_avail numeric := 0; v_saved numeric := 0; v_has_snap boolean := false; v_idle int := 0; r record;
  s_rate numeric; s_cons numeric; s_cush numeric; s_idle numeric; save_raw numeric; save_s numeric;
  due_cnt int; ontime_cnt int; thrift_ever boolean; cyc_done int; sp_cnt int; sp_fast int;
  c_on numeric; c_comp numeric; c_split numeric; circle_raw numeric; circle_s numeric;
  g_principal numeric; g_tenor numeric; g_div int; g_ever boolean; g_roll numeric;
  g_bal numeric; g_ten numeric; g_dv numeric; grow_raw numeric; grow_s numeric;
  b_ever int; b_months int; rec_cnt int; rec_ok int; ad30 numeric; b_cats int; air7 int;
  p_cons numeric; p_rec numeric; p_share numeric; p_var numeric; pay_raw numeric; pay_s numeric;
  raw numeric; v_score int; v_level int; prev record; v_prev_found boolean; v_xp_gain int := 0;
  v_details jsonb; v_no_data text[] := '{}';
  q record; v_prog numeric; v_old_done timestamptz;
  wk_in numeric; wk_dep numeric; wk_qdep int; wk_bills int; wk_ontime int;
  st record; v_cur int := 0; v_newest date; w date; v_best int; q_weeks_arr date[];
  b record; v_earned boolean; v_consec_ontime int; v_prod_types int; n int;
  v_ins int := 0; v_rate numeric; v_foregone numeric; v_active_cats int;
BEGIN
  v_week_ts := v_week::timestamp AT TIME ZONE tz;
  SELECT account_created_at INTO v_created FROM insights_eligible_users WHERE user_id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('user_id', p_user, 'skipped', 'ineligible'); END IF;
  IF v_created > v_now - interval '14 days' THEN v_state := 'building'; END IF;

  SELECT coalesce(sum(amount) FILTER (WHERE occurred_at >= v_now - interval '30 days'),0),
         coalesce(sum(amount) FILTER (WHERE occurred_at >= v_now - interval '60 days' AND occurred_at < v_now - interval '30 days'),0),
         coalesce(sum(amount) FILTER (WHERE occurred_at >= v_now - interval '90 days'),0),
         count(*) > 0
    INTO in30, inprev, in90, in_ever FROM insights_external_inflow WHERE user_id = p_user;
  avg_month := greatest(in90 / 3.0, 1);

  SELECT coalesce(sum(amount) FILTER (WHERE occurred_at >= v_now - interval '30 days'),0), count(*)
    INTO dep30, dep_ever FROM insights_savings_deposits WHERE user_id = p_user;
  SELECT coalesce(sum(amount),0) INTO wd30 FROM insights_savings_withdrawals WHERE user_id = p_user AND occurred_at >= v_now - interval '30 days';
  SELECT count(*) INTO early90 FROM insights_savings_withdrawals WHERE user_id = p_user AND is_early_withdrawal AND occurred_at >= v_now - interval '90 days';
  SELECT count(DISTINCT date_trunc('week', occurred_at AT TIME ZONE tz)) INTO q_weeks
    FROM insights_qualifying_savings_deposits WHERE user_id = p_user AND occurred_at >= (v_week - 21)::timestamp AT TIME ZONE tz;
  SELECT available_balance, coalesce(locked_balance,0) + coalesce(savings_balance,0) INTO v_avail, v_saved
    FROM user_balance_snapshots WHERE user_id = p_user ORDER BY snapshot_date DESC LIMIT 1;
  v_has_snap := FOUND; v_avail := coalesce(v_avail,0); v_saved := coalesce(v_saved,0);
  FOR r IN SELECT snapshot_date, available_balance FROM user_balance_snapshots WHERE user_id = p_user ORDER BY snapshot_date DESC LIMIT 180 LOOP
    EXIT WHEN r.available_balance <= c_idle_min OR EXISTS (SELECT 1 FROM insights_qualifying_savings_deposits d
      WHERE d.user_id = p_user AND (d.occurred_at AT TIME ZONE tz)::date = r.snapshot_date);
    v_idle := v_idle + 1;
  END LOOP;
  IF dep_ever > 0 THEN
    s_rate := CASE WHEN in30 > 0 THEN least(100, (greatest(0, dep30 - wd30) / in30) / 0.20 * 100) END;
    s_cons := q_weeks / 4.0 * 100;
    s_cush := CASE WHEN in90 > 0 THEN least(100, (v_saved / avg_month) / 3 * 100) END;
    s_idle := CASE WHEN v_has_snap THEN greatest(0, 100 - 5 * greatest(0, v_idle - c_idle_days)) END;
    save_raw := insights_weighted(jsonb_build_object('rate', jsonb_build_object('w',50,'v',s_rate),
      'consistency', jsonb_build_object('w',20,'v',s_cons), 'cushion', jsonb_build_object('w',20,'v',s_cush),
      'idle', jsonb_build_object('w',10,'v',s_idle)));
  END IF;
  IF save_raw IS NULL THEN save_s := c_neutral; v_no_data := v_no_data || 'save'::text;
  ELSE save_s := greatest(0, least(100, save_raw - least(15, 5 * early90))); END IF;

  SELECT count(*) FILTER (WHERE contribution_deadline >= v_now - interval '90 days' AND contribution_deadline <= v_now),
         count(*) FILTER (WHERE contribution_deadline >= v_now - interval '90 days' AND contribution_deadline <= v_now AND on_time),
         count(DISTINCT cycle_id) FILTER (WHERE cycle_status = 'completed' AND completed_at >= v_now - interval '180 days'),
         count(*) > 0
    INTO due_cnt, ontime_cnt, cyc_done, thrift_ever FROM insights_thrift_dues WHERE user_id = p_user;
  SELECT count(*), count(*) FILTER (WHERE paid_at IS NOT NULL AND hours_to_settle <= 72)
    INTO sp_cnt, sp_fast FROM insights_split_settlements
    WHERE user_id = p_user AND requested_at >= v_now - interval '90 days' AND status <> 'cancelled';
  c_on := CASE WHEN due_cnt > 0 THEN ontime_cnt::numeric / due_cnt * 100 END;
  c_comp := CASE WHEN thrift_ever THEN least(100, cyc_done * 10) END;
  c_split := CASE WHEN sp_cnt > 0 THEN sp_fast::numeric / sp_cnt * 100 END;
  circle_raw := insights_weighted(jsonb_build_object('thrift_on_time', jsonb_build_object('w',60,'v',c_on),
    'cycle_completion', jsonb_build_object('w',20,'v',c_comp), 'split_settlement', jsonb_build_object('w',20,'v',c_split)));
  IF circle_raw IS NULL THEN circle_s := c_neutral; v_no_data := v_no_data || 'circle'::text; ELSE circle_s := greatest(0, least(100, circle_raw)); END IF;

  SELECT coalesce(sum(principal) FILTER (WHERE status = 'active'),0),
         CASE WHEN coalesce(sum(principal) FILTER (WHERE status = 'active'),0) > 0
              THEN sum(principal * tenor_days) FILTER (WHERE status = 'active') / sum(principal) FILTER (WHERE status = 'active') END,
         count(DISTINCT product_code) FILTER (WHERE status = 'active' OR matured_at >= v_now - interval '180 days'),
         count(*) > 0
    INTO g_principal, g_tenor, g_div, g_ever
    FROM insights_savings_holdings WHERE user_id = p_user AND product_code IN ('vault','lockmax','upfront_yield');
  SELECT CASE
      WHEN bool_or(EXISTS (SELECT 1 FROM insights_savings_holdings h2 WHERE h2.user_id = p_user AND h2.savings_id <> h.savings_id
             AND h2.start_date >= h.matured_at AND h2.start_date < h.matured_at + interval '14 days')) THEN 100
      WHEN bool_or(h.matured_at < v_now - interval '14 days') THEN 0 END
    INTO g_roll FROM insights_savings_holdings h
    WHERE h.user_id = p_user AND h.matured_at >= v_now - interval '180 days' AND h.product_code IN ('vault','lockmax','upfront_yield');
  IF g_ever THEN
    g_bal := CASE WHEN in90 > 0 THEN least(100, (g_principal / avg_month) / 2 * 100) END;
    g_ten := CASE WHEN g_tenor IS NOT NULL THEN least(100, g_tenor / 180 * 100) END;
    g_dv := least(100, g_div / 3.0 * 100);
    grow_raw := insights_weighted(jsonb_build_object('balance_ratio', jsonb_build_object('w',40,'v',g_bal),
      'tenor', jsonb_build_object('w',25,'v',g_ten), 'diversity', jsonb_build_object('w',20,'v',g_dv),
      'rollover', jsonb_build_object('w',15,'v',g_roll)));
  END IF;
  IF grow_raw IS NULL THEN grow_s := c_neutral; v_no_data := v_no_data || 'grow'::text; ELSE grow_s := greatest(0, least(100, grow_raw)); END IF;

  SELECT count(*),
         count(DISTINCT date_trunc('month', occurred_at AT TIME ZONE tz)) FILTER (WHERE occurred_at >= ((v_month - interval '2 months')::timestamp AT TIME ZONE tz)),
         coalesce(sum(amount) FILTER (WHERE category IN ('airtime','data') AND occurred_at >= v_now - interval '30 days'),0),
         count(DISTINCT category) FILTER (WHERE occurred_at >= v_now - interval '90 days'),
         count(*) FILTER (WHERE category = 'airtime' AND occurred_at >= v_now - interval '7 days')
    INTO b_ever, b_months, ad30, b_cats, air7 FROM insights_scorable_bill_payments WHERE user_id = p_user;
  SELECT count(*), count(*) FILTER (WHERE NOT is_late) INTO rec_cnt, rec_ok
    FROM insights_recurring_bill_status WHERE user_id = p_user AND status = 'active';
  IF b_ever > 0 OR rec_cnt > 0 THEN
    p_cons := b_months / 3.0 * 100;
    p_rec := CASE WHEN rec_cnt > 0 THEN rec_ok::numeric / rec_cnt * 100 END;
    p_share := CASE WHEN in30 > 0 THEN
      CASE WHEN ad30 / in30 <= c_share_th THEN 100
           ELSE greatest(0, 100 * (1 - ((ad30 / in30) - c_share_th) / (2 * c_share_th))) END END;
    p_var := least(100, b_cats / 3.0 * 100);
    pay_raw := insights_weighted(jsonb_build_object('bill_consistency', jsonb_build_object('w',40,'v',p_cons),
      'recurring_reliability', jsonb_build_object('w',25,'v',p_rec), 'airtime_data_share', jsonb_build_object('w',25,'v',p_share),
      'category_variety', jsonb_build_object('w',10,'v',p_var)));
  END IF;
  IF pay_raw IS NULL THEN pay_s := c_neutral; v_no_data := v_no_data || 'pay'::text; ELSE pay_s := greatest(0, least(100, pay_raw)); END IF;

  raw := (save_s * (c_weights->>'save')::numeric + circle_s * (c_weights->>'circle')::numeric
        + grow_s * (c_weights->>'grow')::numeric + pay_s * (c_weights->>'pay')::numeric)
        / greatest((c_weights->>'save')::numeric + (c_weights->>'circle')::numeric + (c_weights->>'grow')::numeric + (c_weights->>'pay')::numeric, 1);
  SELECT score, level, xp, state INTO prev FROM user_scores WHERE user_id = p_user;
  v_prev_found := FOUND;
  IF v_prev_found AND prev.state = 'active' THEN v_score := round(0.7 * prev.score + 0.3 * raw); ELSE v_score := round(raw); END IF;
  v_score := greatest(0, least(100, v_score));
  SELECT coalesce(max((l->>'level')::int), 1) INTO v_level FROM jsonb_array_elements(c_levels) l WHERE (l->>'min')::numeric <= v_score;

  v_details := jsonb_build_object(
    'state', v_state, 'raw_score', round(raw, 2), 'smoothed', (v_prev_found AND prev.state = 'active'),
    'no_data_pillars', to_jsonb(v_no_data), 'units', 'naira',
    'inputs', jsonb_build_object('external_inflow_30d', in30, 'external_inflow_prior_30d', inprev, 'external_inflow_90d', in90,
       'savings_deposits_30d', dep30, 'savings_withdrawals_30d', wd30, 'early_withdrawals_90d', early90, 'idle_days', v_idle,
       'idle_min_amount', c_idle_min, 'idle_threshold_days', c_idle_days,
       'thrift_due_90d', due_cnt, 'thrift_on_time_90d', ontime_cnt, 'cycles_completed_180d', cyc_done,
       'split_shares_90d', sp_cnt, 'split_settled_72h', sp_fast,
       'growth_avg_tenor_days', g_tenor, 'growth_products_180d', g_div,
       'bills_ever', b_ever, 'bill_months_of_3', b_months, 'recurring_bills', rec_cnt, 'recurring_not_late', rec_ok,
       'airtime_data_30d', ad30, 'airtime_data_threshold', c_share_th, 'bill_categories_90d', b_cats),
    'pillars', jsonb_build_object(
      'save', jsonb_build_object('score', round(save_s), 'components', jsonb_build_object('rate', s_rate, 'consistency', s_cons, 'cushion', s_cush, 'idle', s_idle), 'early_withdrawal_penalty', least(15, 5 * early90)),
      'circle', jsonb_build_object('score', round(circle_s), 'components', jsonb_build_object('thrift_on_time', c_on, 'cycle_completion', c_comp, 'split_settlement', c_split)),
      'grow', jsonb_build_object('score', round(grow_s), 'components', jsonb_build_object('balance_ratio', g_bal, 'tenor', g_ten, 'diversity', g_dv, 'rollover', g_roll), 'rollover_is_approximate', true),
      'pay', jsonb_build_object('score', round(pay_s), 'components', jsonb_build_object('bill_consistency', p_cons, 'recurring_reliability', p_rec, 'airtime_data_share', p_share, 'category_variety', p_var), 'betting_excluded', true)),
    'weights', c_weights);

  IF p_dry_run THEN
    RETURN jsonb_build_object('user_id', p_user, 'dry_run', true, 'score', v_score, 'level', v_level, 'details', v_details);
  END IF;

  SELECT coalesce(sum(amount),0) INTO wk_in FROM insights_external_inflow WHERE user_id = p_user AND occurred_at >= v_week_ts;
  SELECT coalesce(sum(amount),0) INTO wk_dep FROM insights_savings_deposits WHERE user_id = p_user AND occurred_at >= v_week_ts;
  SELECT count(*) INTO wk_qdep FROM insights_qualifying_savings_deposits WHERE user_id = p_user AND occurred_at >= v_week_ts;
  SELECT count(*) INTO wk_bills FROM insights_scorable_bill_payments WHERE user_id = p_user AND occurred_at >= v_week_ts;
  SELECT count(*) INTO wk_ontime FROM insights_thrift_contributions WHERE user_id = p_user AND on_time AND paid_at >= v_week_ts;
  FOR q IN SELECT * FROM quests WHERE active LOOP
    v_prog := CASE q.key
      WHEN 'save_10pct_inflow' THEN CASE WHEN wk_in > 0 THEN round(wk_dep / wk_in, 4) ELSE 0 END
      WHEN 'pay_bill' THEN wk_bills
      WHEN 'thrift_on_time' THEN wk_ontime
      WHEN 'add_to_goal' THEN wk_qdep
      ELSE 0 END;
    v_old_done := NULL;
    SELECT completed_at INTO v_old_done FROM user_quests WHERE user_id = p_user AND quest_id = q.id AND week_start = v_week;
    INSERT INTO user_quests (user_id, quest_id, week_start, progress, completed_at)
    VALUES (p_user, q.id, v_week, v_prog, CASE WHEN v_prog >= q.target_value THEN v_now END)
    ON CONFLICT (user_id, quest_id, week_start) DO UPDATE
      SET progress = EXCLUDED.progress,
          completed_at = coalesce(user_quests.completed_at, EXCLUDED.completed_at), updated_at = now();
    IF v_old_done IS NULL AND v_prog >= q.target_value THEN v_xp_gain := v_xp_gain + q.reward_xp; END IF;
  END LOOP;

  SELECT * INTO st FROM user_streaks WHERE user_id = p_user;
  WITH wks AS (
    SELECT DISTINCT date_trunc('week', occurred_at AT TIME ZONE tz)::date AS wk FROM insights_qualifying_savings_deposits
      WHERE user_id = p_user AND occurred_at >= v_now - interval '400 days'
    UNION
    SELECT DISTINCT date_trunc('week', paid_at AT TIME ZONE tz)::date FROM insights_thrift_contributions
      WHERE user_id = p_user AND on_time AND paid_at >= v_now - interval '400 days')
  SELECT max(wk), array_agg(wk) INTO v_newest, q_weeks_arr FROM wks;
  q_weeks_arr := coalesce(q_weeks_arr, '{}'::date[]);
  w := CASE WHEN v_week = ANY(q_weeks_arr) THEN v_week ELSE v_week - 7 END;
  WHILE w = ANY(q_weeks_arr) LOOP v_cur := v_cur + 1; w := w - 7; END LOOP;
  v_best := greatest(coalesce(st.best_weeks, 0), v_cur);
  IF v_newest IS NOT NULL AND (st.last_qualifying_week IS NULL OR v_newest > st.last_qualifying_week) THEN
    SELECT count(*) INTO n FROM unnest(q_weeks_arr) x WHERE x > coalesce(st.last_qualifying_week, v_week - 7) AND x <= v_newest;
    v_xp_gain := v_xp_gain + 10 * n;
  END IF;
  INSERT INTO user_streaks (user_id, current_weeks, best_weeks, last_qualifying_week)
  VALUES (p_user, v_cur, v_best, v_newest)
  ON CONFLICT (user_id) DO UPDATE SET current_weeks = EXCLUDED.current_weeks, best_weeks = EXCLUDED.best_weeks,
    last_qualifying_week = coalesce(EXCLUDED.last_qualifying_week, user_streaks.last_qualifying_week), updated_at = now();

  SELECT count(*) INTO v_consec_ontime FROM (
    SELECT on_time, sum(CASE WHEN on_time THEN 0 ELSE 1 END) OVER (ORDER BY contribution_deadline DESC NULLS LAST) AS breaks
    FROM insights_thrift_dues WHERE user_id = p_user AND contribution_deadline <= v_now) z WHERE breaks = 0;
  SELECT (SELECT count(DISTINCT product_code) FROM insights_savings_holdings WHERE user_id = p_user)
       + (CASE WHEN thrift_ever THEN 1 ELSE 0 END)
       + (CASE WHEN EXISTS (SELECT 1 FROM insights_split_settlements WHERE user_id = p_user AND status = 'paid') THEN 1 ELSE 0 END)
       + (CASE WHEN b_ever > 0 THEN 1 ELSE 0 END)
    INTO v_prod_types;
  FOR b IN SELECT * FROM badges LOOP
    v_earned := CASE b.key
      WHEN 'ajo_anchor' THEN v_consec_ontime >= coalesce((b.criteria->>'on_time_cycles')::int, 6)
      WHEN 'lock_master' THEN EXISTS (SELECT 1 FROM insights_savings_holdings WHERE user_id = p_user AND product_code IN ('vault','lockmax','upfront_yield') AND matured_at IS NOT NULL)
      WHEN 'bill_boss' THEN b_ever >= coalesce((b.criteria->>'bills_paid')::int, 5)
      WHEN 'first_saver' THEN dep_ever >= 1
      WHEN 'goal_getter' THEN EXISTS (SELECT 1 FROM insights_savings_holdings WHERE user_id = p_user AND product_code = 'goalsave' AND matured_at IS NOT NULL)
      WHEN 'steady_saver' THEN v_best >= coalesce((b.criteria->>'streak_weeks')::int, 4)
      WHEN 'diversifier' THEN v_prod_types >= coalesce((b.criteria->>'product_types')::int, 3)
      WHEN 'level_5' THEN v_state = 'active' AND v_level >= 5
      ELSE false END;
    IF v_earned THEN
      INSERT INTO user_badges (user_id, badge_id) VALUES (p_user, b.id) ON CONFLICT (user_id, badge_id) DO NOTHING;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN v_xp_gain := v_xp_gain + 50; END IF;
    END IF;
  END LOOP;

  IF v_state = 'active' AND v_prev_found AND prev.state = 'active' AND v_level > prev.level THEN
    v_xp_gain := v_xp_gain + 100 * (v_level - prev.level);
  END IF;

  INSERT INTO user_scores (user_id, score, save_score, circle_score, grow_score, pay_score, level, xp, previous_score, details, computed_at, state, last_run_id)
  VALUES (p_user, v_score, round(save_s), round(circle_s), round(grow_s), round(pay_s), v_level, v_xp_gain, NULL, v_details, v_now, v_state, p_run_id)
  ON CONFLICT (user_id) DO UPDATE SET
    previous_score = user_scores.score, score = EXCLUDED.score, save_score = EXCLUDED.save_score,
    circle_score = EXCLUDED.circle_score, grow_score = EXCLUDED.grow_score, pay_score = EXCLUDED.pay_score,
    level = EXCLUDED.level, xp = user_scores.xp + EXCLUDED.xp, details = EXCLUDED.details,
    computed_at = EXCLUDED.computed_at, state = EXCLUDED.state, last_run_id = EXCLUDED.last_run_id, updated_at = now();

  IF v_state = 'active' THEN
    INSERT INTO user_score_history (user_id, month, score, save_score, circle_score, grow_score, pay_score, level)
    VALUES (p_user, v_month, v_score, round(save_s), round(circle_s), round(grow_s), round(pay_s), v_level)
    ON CONFLICT (user_id, month) DO UPDATE SET score = EXCLUDED.score, save_score = EXCLUDED.save_score,
      circle_score = EXCLUDED.circle_score, grow_score = EXCLUDED.grow_score, pay_score = EXCLUDED.pay_score,
      level = EXCLUDED.level, updated_at = now();
  END IF;

  IF inprev > 0 AND in30 >= inprev * (1 + c_spike) THEN
    v_ins := v_ins + insights_emit(p_user, 'inflow_spike', 'win', 'More money came in this month',
      format('You received ₦%s in the last 30 days, up from ₦%s. One way to consider using the extra is a Goal Save.', to_char(in30,'FM999,999,990'), to_char(inprev,'FM999,999,990')),
      'goalsave_new', jsonb_build_object('inflow_30d', in30, 'prior_30d', inprev, 'threshold', c_spike), v_today::text, false);
  END IF;
  IF v_consec_ontime >= 6 THEN
    v_ins := v_ins + insights_emit(p_user, 'thrift_streak', 'win', format('%s thrift contributions on time in a row', v_consec_ontime),
      'Your circle can count on you. Keep it going.', 'thrift', jsonb_build_object('consecutive_on_time', v_consec_ontime),
      'milestone_' || (v_consec_ontime / 6)::text, true);
  END IF;
  IF v_idle >= c_idle_days THEN
    SELECT min_user_rate INTO v_rate FROM insights_product_rates WHERE product_code = 'lockmax';
    v_rate := coalesce(v_rate, 0);
    v_foregone := round(v_avail * (v_rate / 100) * v_idle / 365, 2);
    v_ins := v_ins + insights_emit(p_user, 'idle_wallet', 'warning', 'Your wallet balance has been resting',
      format('About ₦%s has stayed in your wallet for %s days. Ways to consider: Lock Max or Upfront Yield.', to_char(v_avail,'FM999,999,990'), v_idle),
      'lockmax_new', jsonb_build_object('balance', v_avail, 'idle_days', v_idle, 'rate_pct', v_rate, 'product', 'lockmax',
        'estimated_interest_foregone', v_foregone, 'formula', 'balance x (rate / 100) x idle_days / 365'), v_today::text, false);
  END IF;
  FOR r IN SELECT d.cycle_id, d.amount_due, d.contribution_deadline FROM insights_thrift_dues d
           WHERE d.user_id = p_user AND NOT d.contributed AND d.contribution_deadline > v_now
             AND d.contribution_deadline <= v_now + interval '3 days' AND d.amount_due > v_avail LOOP
    v_ins := v_ins + insights_emit(p_user, 'thrift_due', 'warning', 'Thrift contribution due soon',
      format('₦%s is due by %s and your wallet may not cover it yet.', to_char(r.amount_due,'FM999,999,990'), to_char(r.contribution_deadline AT TIME ZONE tz, 'Dy DD Mon')),
      'wallet_topup', jsonb_build_object('amount_due', r.amount_due, 'deadline', r.contribution_deadline), r.cycle_id::text, true);
  END LOOP;
  IF in30 > 0 AND NOT EXISTS (SELECT 1 FROM insights_qualifying_savings_deposits WHERE user_id = p_user AND occurred_at >= v_now - interval '30 days') THEN
    v_ins := v_ins + insights_emit(p_user, 'saving_pause', 'tip', 'A small step toward saving',
      'No savings were added in the last 30 days. A small Goal Save is one easy way to restart.', 'goalsave_new',
      jsonb_build_object('inflow_30d', in30, 'savings_deposits_30d', 0), v_today::text, false);
  END IF;
  FOR r IN SELECT savings_id, product_code, maturity_date FROM insights_savings_holdings
           WHERE user_id = p_user AND status = 'active' AND maturity_date > v_now AND maturity_date <= v_now + interval '7 days' LOOP
    v_ins := v_ins + insights_emit(p_user, 'maturity_soon', 'tip', 'A plan is maturing soon',
      format('Your plan matures on %s. You can review your options before then.', to_char(r.maturity_date AT TIME ZONE tz, 'Dy DD Mon')),
      'savings_detail', jsonb_build_object('savings_id', r.savings_id, 'product_code', r.product_code, 'maturity_date', r.maturity_date), r.savings_id::text, true);
  END LOOP;
  IF air7 >= 3 OR (in30 > 0 AND ad30 / in30 > c_share_th) THEN
    v_ins := v_ins + insights_emit(p_user, 'airtime_data_heavy', 'tip', 'Airtime and data add up',
      format('You spent ₦%s on airtime and data in 30 days. A bigger data bundle may cost less per top-up.', to_char(ad30,'FM999,999,990')),
      'bills_data', jsonb_build_object('airtime_topups_7d', air7, 'airtime_data_30d', ad30, 'inflow_30d', in30, 'threshold', c_share_th), v_today::text, false);
  END IF;
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM insights_savings_deposits WHERE user_id = p_user AND occurred_at >= v_now - interval '30 days') THEN 1 ELSE 0 END)
       + (CASE WHEN EXISTS (SELECT 1 FROM insights_thrift_contributions WHERE user_id = p_user AND paid_at >= v_now - interval '30 days') THEN 1 ELSE 0 END)
       + (CASE WHEN EXISTS (SELECT 1 FROM insights_split_settlements WHERE user_id = p_user AND paid_at >= v_now - interval '30 days') THEN 1 ELSE 0 END)
       + (CASE WHEN EXISTS (SELECT 1 FROM insights_scorable_bill_payments WHERE user_id = p_user AND occurred_at >= v_now - interval '30 days') THEN 1 ELSE 0 END)
    INTO v_active_cats;
  IF v_active_cats = 1 THEN
    v_ins := v_ins + insights_emit(p_user, 'single_product', 'tip', 'Try one more way to grow',
      CASE WHEN dep30 > 0 THEN 'You''re saving already. A thrift circle is a natural next step.'
           ELSE 'A small Goal Save is a natural next step alongside what you already use.' END,
      CASE WHEN dep30 > 0 THEN 'thrift' ELSE 'goalsave_new' END, jsonb_build_object('active_categories_30d', 1), v_today::text, false);
  END IF;
  IF in_ever AND b_ever = 0 THEN
    v_ins := v_ins + insights_emit(p_user, 'first_bill_pay', 'tip', 'Pay your first bill in Vestara',
      'Airtime, data or electricity can be paid straight from your wallet.', 'bills', jsonb_build_object('bills_ever', 0), v_today::text, false);
  END IF;
  FOR r IN SELECT savings_id, penalty_amount FROM insights_savings_withdrawals
           WHERE user_id = p_user AND is_early_withdrawal AND occurred_at >= v_now - interval '14 days' LOOP
    v_ins := v_ins + insights_emit(p_user, 'early_withdrawal', 'tip', 'About your early withdrawal',
      format('A ₦%s penalty applied when the plan ended early. A tenor that fits your plans can help avoid this next time.', to_char(r.penalty_amount,'FM999,999,990.00')),
      'savings', jsonb_build_object('savings_id', r.savings_id, 'penalty_amount', r.penalty_amount), r.savings_id::text, true);
  END LOOP;

  RETURN jsonb_build_object('user_id', p_user, 'score', v_score, 'level', v_level, 'state', v_state,
    'xp_gained', v_xp_gain, 'insights_created', v_ins);
END $$;
REVOKE EXECUTE ON FUNCTION public.insights_compute_user(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insights_compute_user(uuid, boolean, uuid) TO service_role;
