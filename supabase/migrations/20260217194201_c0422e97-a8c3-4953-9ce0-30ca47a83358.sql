
-- Add last_tokenized_at column for 24hr cooldown enforcement
ALTER TABLE public.card_tokens 
ADD COLUMN IF NOT EXISTS last_tokenized_at timestamp with time zone DEFAULT now();

-- Backfill existing rows
UPDATE public.card_tokens SET last_tokenized_at = created_at WHERE last_tokenized_at IS NULL;
