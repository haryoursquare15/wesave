
-- Phase 1: Extend card_tokens table to replace with full payment token support
-- Add missing columns for production recurring payment flow

-- Add first_6digits column
ALTER TABLE public.card_tokens
ADD COLUMN IF NOT EXISTS first_6digits TEXT;

-- Add charge_email for Flutterwave sandbox/live email handling
ALTER TABLE public.card_tokens
ADD COLUMN IF NOT EXISTS charge_email TEXT;

-- Add card_status with more granular states (keeping is_active for backward compat)
ALTER TABLE public.card_tokens
ADD COLUMN IF NOT EXISTS card_status TEXT NOT NULL DEFAULT 'active'
CHECK (card_status IN ('active', 'expired', 'revoked', 'pending'));

-- Add group_id to track which group the token was created for
ALTER TABLE public.card_tokens
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.thrift_groups(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_card_tokens_user_status ON public.card_tokens(user_id, card_status);
CREATE INDEX IF NOT EXISTS idx_card_tokens_group ON public.card_tokens(group_id);

-- Add tokenization_completed to group_memberships to gate participation
ALTER TABLE public.group_memberships
ADD COLUMN IF NOT EXISTS tokenization_completed BOOLEAN DEFAULT false;

-- Add terms_accepted_at to group_memberships
ALTER TABLE public.group_memberships
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
