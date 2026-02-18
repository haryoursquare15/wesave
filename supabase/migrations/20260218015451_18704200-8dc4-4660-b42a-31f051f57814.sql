
-- Create table for bank change OTPs
CREATE TABLE public.bank_change_otps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  otp_code TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '5 minutes'),
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bank_change_otps ENABLE ROW LEVEL SECURITY;

-- Only service role can access (edge functions)
CREATE POLICY "Service role only for bank OTPs"
  ON public.bank_change_otps FOR ALL
  USING (false);

-- Auto-cleanup old OTPs (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS trigger AS $$
BEGIN
  DELETE FROM public.bank_change_otps WHERE expires_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER cleanup_otps_trigger
  AFTER INSERT ON public.bank_change_otps
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_expired_otps();
