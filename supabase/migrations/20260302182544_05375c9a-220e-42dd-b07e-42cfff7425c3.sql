
-- Rate limiting table for edge function request tracking
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL, -- IP or user_id
  endpoint text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_lookup ON public.rate_limits (identifier, endpoint, window_start);

-- Auto-cleanup old rate limit entries (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
$$;

-- Rate limit check function - returns true if allowed, false if rate limited
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _identifier text,
  _endpoint text,
  _max_requests integer DEFAULT 30,
  _window_seconds integer DEFAULT 60
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  v_window_start := date_trunc('minute', now());
  
  -- Try to increment existing window
  UPDATE public.rate_limits 
  SET request_count = request_count + 1
  WHERE identifier = _identifier 
    AND endpoint = _endpoint 
    AND window_start = v_window_start
  RETURNING request_count INTO v_count;
  
  IF NOT FOUND THEN
    -- Create new window entry
    INSERT INTO public.rate_limits (identifier, endpoint, window_start, request_count)
    VALUES (_identifier, _endpoint, v_window_start, 1)
    ON CONFLICT DO NOTHING;
    v_count := 1;
  END IF;
  
  -- Cleanup old entries periodically (1% chance per request)
  IF random() < 0.01 THEN
    PERFORM public.cleanup_rate_limits();
  END IF;
  
  IF v_count > _max_requests THEN
    RETURN json_build_object('allowed', false, 'count', v_count, 'limit', _max_requests);
  END IF;
  
  RETURN json_build_object('allowed', true, 'count', v_count, 'limit', _max_requests);
END;
$$;

-- Request nonces table for replay protection
CREATE TABLE IF NOT EXISTS public.request_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce text NOT NULL UNIQUE,
  endpoint text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nonces_lookup ON public.request_nonces (nonce);
CREATE INDEX idx_nonces_cleanup ON public.request_nonces (created_at);

-- Check and consume a nonce (returns true if valid/unused, false if replay)
CREATE OR REPLACE FUNCTION public.consume_nonce(
  _nonce text,
  _endpoint text,
  _user_id uuid DEFAULT NULL,
  _max_age_seconds integer DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if nonce was already used
  IF EXISTS (SELECT 1 FROM public.request_nonces WHERE nonce = _nonce) THEN
    RETURN false;
  END IF;
  
  -- Store the nonce
  INSERT INTO public.request_nonces (nonce, endpoint, user_id)
  VALUES (_nonce, _endpoint, _user_id);
  
  -- Periodically cleanup old nonces (1% chance)
  IF random() < 0.01 THEN
    DELETE FROM public.request_nonces WHERE created_at < now() - interval '1 hour';
  END IF;
  
  RETURN true;
END;
$$;

-- RLS: These tables are only accessed by service_role via edge functions
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_nonces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for rate_limits" ON public.rate_limits
  FOR ALL USING (false);

CREATE POLICY "Service role only for request_nonces" ON public.request_nonces
  FOR ALL USING (false);
