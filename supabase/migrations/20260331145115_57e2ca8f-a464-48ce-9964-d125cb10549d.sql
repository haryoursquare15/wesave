
CREATE TABLE public.vfd_sandbox_virtual_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  card_id TEXT NOT NULL,
  masked_pan TEXT NOT NULL,
  full_pan_encrypted TEXT,
  cvv_encrypted TEXT,
  expiry_date TEXT NOT NULL,
  pin_offset TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  issuance_fee NUMERIC NOT NULL DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  blocked_at TIMESTAMP WITH TIME ZONE,
  activated_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, card_id)
);

ALTER TABLE public.vfd_sandbox_virtual_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cards"
  ON public.vfd_sandbox_virtual_cards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to virtual cards"
  ON public.vfd_sandbox_virtual_cards
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
