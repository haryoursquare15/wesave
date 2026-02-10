
-- Card tokens table for Flutterwave tokenized cards
CREATE TABLE public.card_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  card_token TEXT NOT NULL,
  card_last4 TEXT,
  card_type TEXT,
  card_expiry TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.card_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own card tokens"
  ON public.card_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own card tokens"
  ON public.card_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own card tokens"
  ON public.card_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own card tokens"
  ON public.card_tokens FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access card_tokens"
  ON public.card_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_card_tokens_user_active ON public.card_tokens (user_id, is_active);

-- Contribution retries table for card fallback tracking
CREATE TABLE public.contribution_retries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  group_id UUID NOT NULL,
  cycle_id UUID NOT NULL,
  contribution_amount NUMERIC NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'defaulted')),
  payment_source TEXT CHECK (payment_source IN ('wallet', 'card_fallback')),
  failure_reason TEXT,
  transaction_reference TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contribution_retries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own retries"
  ON public.contribution_retries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access retries"
  ON public.contribution_retries FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_contribution_retries_pending ON public.contribution_retries (status, next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX idx_contribution_retries_user_group ON public.contribution_retries (user_id, group_id, cycle_id);

-- Trigger to update updated_at
CREATE TRIGGER update_card_tokens_updated_at
  BEFORE UPDATE ON public.card_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contribution_retries_updated_at
  BEFORE UPDATE ON public.contribution_retries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
