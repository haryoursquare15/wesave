ALTER TYPE public.vestara_tx_type ADD VALUE IF NOT EXISTS 'savings_pending_hold';
ALTER TYPE public.vestara_tx_type ADD VALUE IF NOT EXISTS 'savings_pending_release';
ALTER TYPE public.vestara_tx_type ADD VALUE IF NOT EXISTS 'savings_activation';