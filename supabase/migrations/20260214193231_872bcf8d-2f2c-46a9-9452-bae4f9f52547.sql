ALTER TABLE public.card_tokens
ADD COLUMN IF NOT EXISTS recurring_amount NUMERIC;

COMMENT ON COLUMN public.card_tokens.recurring_amount
IS 'The contribution amount authorized during card tokenization';