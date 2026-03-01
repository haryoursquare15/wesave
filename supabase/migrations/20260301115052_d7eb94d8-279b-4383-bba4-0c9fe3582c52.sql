
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := lower(substr(md5(NEW.id::text || extract(epoch from now())::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;
