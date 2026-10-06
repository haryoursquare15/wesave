CREATE TABLE public.whatsapp_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL CHECK (phone ~ '^[0-9]{10,15}$'),
  opted_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_preferences TO authenticated;
GRANT ALL ON public.whatsapp_preferences TO service_role;
ALTER TABLE public.whatsapp_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whatsapp prefs" ON public.whatsapp_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  notification_id uuid UNIQUE,
  template text,
  status text NOT NULL,
  wa_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_messages TO service_role;
GRANT SELECT ON public.whatsapp_messages TO authenticated;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view whatsapp log" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (public.is_any_admin(auth.uid()));