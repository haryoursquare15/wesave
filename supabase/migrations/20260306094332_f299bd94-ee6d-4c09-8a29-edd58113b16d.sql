
-- SplitPay Module: Completely independent from Esusu/Thrift

-- Table: split_requests
CREATE TABLE public.split_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL,
  total_amount NUMERIC NOT NULL,
  number_of_people INTEGER NOT NULL,
  amount_per_person NUMERIC NOT NULL,
  merchant_account_name TEXT NOT NULL,
  merchant_bank_name TEXT NOT NULL,
  merchant_account_number TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expiry_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: split_participants
CREATE TABLE public.split_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_request_id UUID NOT NULL REFERENCES public.split_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount_due NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: user can only be invited once per split
ALTER TABLE public.split_participants ADD CONSTRAINT split_participants_unique_user UNIQUE (split_request_id, user_id);

-- Table: split_transactions
CREATE TABLE public.split_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_request_id UUID NOT NULL REFERENCES public.split_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  wallet_ledger_id UUID,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.split_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: split_requests
CREATE POLICY "Users can view split requests they created or participate in"
  ON public.split_requests FOR SELECT TO authenticated
  USING (
    creator_user_id = auth.uid()
    OR id IN (SELECT split_request_id FROM public.split_participants WHERE user_id = auth.uid())
  );

CREATE POLICY "Authenticated users can create split requests"
  ON public.split_requests FOR INSERT TO authenticated
  WITH CHECK (creator_user_id = auth.uid());

CREATE POLICY "Creator can update own split requests"
  ON public.split_requests FOR UPDATE TO authenticated
  USING (creator_user_id = auth.uid());

-- RLS: split_participants
CREATE POLICY "Users can view participants of their splits"
  ON public.split_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR split_request_id IN (SELECT id FROM public.split_requests WHERE creator_user_id = auth.uid())
  );

CREATE POLICY "Creator can insert participants"
  ON public.split_participants FOR INSERT TO authenticated
  WITH CHECK (
    split_request_id IN (SELECT id FROM public.split_requests WHERE creator_user_id = auth.uid())
  );

CREATE POLICY "Participant can update own status"
  ON public.split_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- RLS: split_transactions
CREATE POLICY "Users can view their own split transactions"
  ON public.split_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert split transactions"
  ON public.split_transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Enable realtime for live progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.split_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.split_transactions;

-- Atomic RPC: Process split payment (debit wallet, record transaction)
CREATE OR REPLACE FUNCTION public.process_split_payment(
  _split_request_id UUID,
  _user_id UUID,
  _amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_participant split_participants%ROWTYPE;
  v_request split_requests%ROWTYPE;
  v_wallet wallets%ROWTYPE;
  v_new_balance NUMERIC;
  v_ledger_id UUID;
  v_tx_ref TEXT;
  v_paid_count INTEGER;
  v_total_participants INTEGER;
BEGIN
  -- Validate the split request
  SELECT * INTO v_request FROM split_requests WHERE id = _split_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Split request not found');
  END IF;
  IF v_request.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', 'Split request is no longer active');
  END IF;
  IF v_request.expiry_date IS NOT NULL AND v_request.expiry_date < now() THEN
    UPDATE split_requests SET status = 'expired', updated_at = now() WHERE id = _split_request_id;
    RETURN json_build_object('success', false, 'error', 'Split request has expired');
  END IF;

  -- Validate participant
  SELECT * INTO v_participant FROM split_participants
  WHERE split_request_id = _split_request_id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'You are not a participant in this split');
  END IF;
  IF v_participant.status = 'paid' THEN
    RETURN json_build_object('success', false, 'error', 'You have already paid');
  END IF;
  IF v_participant.status = 'declined' THEN
    RETURN json_build_object('success', false, 'error', 'You have declined this split');
  END IF;

  -- Validate amount matches
  IF _amount != v_participant.amount_due THEN
    RETURN json_build_object('success', false, 'error', 'Amount mismatch');
  END IF;

  -- Lock wallet and check balance
  SELECT * INTO v_wallet FROM wallets WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  IF COALESCE(v_wallet.available_balance, 0) < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  v_new_balance := COALESCE(v_wallet.available_balance, 0) - _amount;
  v_tx_ref := 'split-' || _split_request_id || '-' || _user_id || '-' || extract(epoch from now())::bigint;

  -- Debit wallet via ledger
  INSERT INTO ledger_entries (
    wallet_id, user_id, entry_type, amount,
    balance_before, balance_after,
    locked_before, locked_after,
    reference_type, reference_id, description
  ) VALUES (
    v_wallet.id, _user_id, 'debit', _amount,
    COALESCE(v_wallet.available_balance, 0), v_new_balance,
    COALESCE(v_wallet.locked_balance, 0), COALESCE(v_wallet.locked_balance, 0),
    'split_payment', v_tx_ref,
    'SplitPay: ' || v_request.purpose
  ) RETURNING id INTO v_ledger_id;

  -- Update wallet balance
  UPDATE wallets SET available_balance = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  -- Record split transaction
  INSERT INTO split_transactions (split_request_id, user_id, amount, wallet_ledger_id)
  VALUES (_split_request_id, _user_id, _amount, v_ledger_id);

  -- Record in main transactions table
  INSERT INTO transactions (user_id, type, amount, status, reference, description)
  VALUES (_user_id, 'split_payment', _amount, 'completed', v_tx_ref, 'SplitPay: ' || v_request.purpose);

  -- Mark participant as paid
  UPDATE split_participants SET status = 'paid', paid_at = now() WHERE id = v_participant.id;

  -- Check if all participants have paid
  SELECT COUNT(*) INTO v_total_participants FROM split_participants WHERE split_request_id = _split_request_id;
  SELECT COUNT(*) INTO v_paid_count FROM split_participants WHERE split_request_id = _split_request_id AND status = 'paid';

  IF v_paid_count = v_total_participants THEN
    UPDATE split_requests SET status = 'completed', updated_at = now() WHERE id = _split_request_id;
  END IF;

  -- Create notification for creator
  INSERT INTO user_notifications (user_id, title, message, notification_type)
  SELECT v_request.creator_user_id, 'SplitPay Payment',
    COALESCE(p.full_name, p.username, 'A participant') || ' paid ₦' || _amount || ' for "' || v_request.purpose || '"',
    'split_payment'
  FROM profiles p WHERE p.id = _user_id;

  -- If all paid, notify creator
  IF v_paid_count = v_total_participants THEN
    INSERT INTO user_notifications (user_id, title, message, notification_type)
    VALUES (v_request.creator_user_id, 'SplitPay Complete', 'All participants have paid for "' || v_request.purpose || '"!', 'split_complete');
  END IF;

  RETURN json_build_object(
    'success', true,
    'ledger_id', v_ledger_id,
    'new_balance', v_new_balance,
    'all_paid', v_paid_count = v_total_participants
  );
END;
$$;

-- Admin access policies
CREATE POLICY "Admins can view all split requests"
  ON public.split_requests FOR SELECT TO authenticated
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Admins can view all split participants"
  ON public.split_participants FOR SELECT TO authenticated
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Admins can view all split transactions"
  ON public.split_transactions FOR SELECT TO authenticated
  USING (public.is_any_admin(auth.uid()));
