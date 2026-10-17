ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  transactions boolean NOT NULL DEFAULT true,
  security boolean NOT NULL DEFAULT true,
  marketing boolean NOT NULL DEFAULT false,
  CONSTRAINT security_always_on CHECK (security IS TRUE)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notification preferences"
ON public.notification_preferences FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.notification_preferences;
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO _row FROM public.notification_preferences WHERE user_id = auth.uid();
  RETURN _row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences() TO authenticated;