CREATE TABLE public.device_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 token text UNIQUE NOT NULL,
 platform text DEFAULT 'android',
 created_at timestamptz DEFAULT now(),
 last_seen timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own device tokens" ON public.device_tokens FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE INDEX device_tokens_user_id_idx ON public.device_tokens(user_id);
-- Application-owned cleanup avoids foreign keys into the managed auth schema.
CREATE FUNCTION public.cleanup_android_device_tokens() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN DELETE FROM public.device_tokens WHERE user_id = OLD.id; RETURN OLD; END; $$;
REVOKE ALL ON FUNCTION public.cleanup_android_device_tokens() FROM PUBLIC;
CREATE TRIGGER cleanup_android_device_tokens AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.cleanup_android_device_tokens();