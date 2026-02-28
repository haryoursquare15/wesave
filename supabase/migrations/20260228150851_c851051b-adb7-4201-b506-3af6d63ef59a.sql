
-- Table to track sent group reminder emails (prevent duplicates within a week)
CREATE TABLE public.group_join_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  reminder_count integer NOT NULL DEFAULT 1
);

-- Index for quick lookup
CREATE INDEX idx_group_join_reminders_user_id ON public.group_join_reminders(user_id);
CREATE INDEX idx_group_join_reminders_sent_at ON public.group_join_reminders(sent_at);

-- RLS: only service role needs access
ALTER TABLE public.group_join_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for group join reminders"
  ON public.group_join_reminders FOR ALL
  USING (false);
