CREATE TABLE public.complaint_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  issue_type text NOT NULL,
  label text NOT NULL,
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  sla_hours int NOT NULL DEFAULT 48,
  owner_team text NOT NULL DEFAULT 'support',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (service, issue_type)
);
GRANT SELECT ON public.complaint_categories TO authenticated;
GRANT ALL ON public.complaint_categories TO service_role;
ALTER TABLE public.complaint_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read active categories" ON public.complaint_categories FOR SELECT TO authenticated USING (active);

CREATE SEQUENCE public.complaint_ticket_seq;

CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  service text NOT NULL,
  issue_type text NOT NULL,
  transaction_id uuid,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','awaiting_reply','resolved','closed')),
  sla_due_at timestamptz,
  assigned_to uuid,
  freeze_requested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX complaints_user_idx ON public.complaints(user_id, created_at DESC);
CREATE UNIQUE INDEX complaints_one_open_per_tx ON public.complaints(transaction_id) WHERE transaction_id IS NOT NULL AND status NOT IN ('resolved','closed');
GRANT SELECT ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own complaints" ON public.complaints FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.complaint_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('user','agent','system')),
  event_type text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX complaint_events_c_idx ON public.complaint_events(complaint_id, created_at);
GRANT SELECT, INSERT ON public.complaint_events TO authenticated;
GRANT ALL ON public.complaint_events TO service_role;
ALTER TABLE public.complaint_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own complaint events" ON public.complaint_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.user_id = auth.uid()));
CREATE POLICY "Users reply on own open complaints" ON public.complaint_events FOR INSERT TO authenticated
  WITH CHECK (actor_type = 'user' AND event_type = 'reply' AND length(coalesce(message,'')) BETWEEN 1 AND 2000
    AND EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.user_id = auth.uid() AND c.status NOT IN ('resolved','closed')));

CREATE TABLE public.complaint_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.complaint_attachments TO authenticated;
GRANT ALL ON public.complaint_attachments TO service_role;
ALTER TABLE public.complaint_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own complaint attachments" ON public.complaint_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.next_complaint_ticket_no()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'VST-' || to_char(now() AT TIME ZONE 'Africa/Lagos','YYYY') || '-' || lpad(nextval('public.complaint_ticket_seq')::text, 6, '0')
$$;
REVOKE EXECUTE ON FUNCTION public.next_complaint_ticket_no() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_complaint_ticket_no() TO service_role;

-- Notifications on creation, status change, agent reply; user replies bump status
CREATE OR REPLACE FUNCTION public.complaints_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  IF TG_TABLE_NAME = 'complaints' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO vfd_sandbox_notifications(user_id,title,message,notification_type)
      VALUES (NEW.user_id,'Complaint received','We got your complaint '||NEW.ticket_no||'. We''ll update you soon.','complaint');
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.updated_at := now();
      IF NEW.status = 'resolved' THEN NEW.resolved_at := now(); END IF;
      v_label := CASE NEW.status WHEN 'in_review' THEN 'is in review' WHEN 'awaiting_reply' THEN 'needs your reply'
        WHEN 'resolved' THEN 'has been resolved' WHEN 'closed' THEN 'is closed' ELSE 'is open again' END;
      INSERT INTO complaint_events(complaint_id,actor_type,event_type,message) VALUES (NEW.id,'system','status_'||NEW.status,NULL);
      INSERT INTO vfd_sandbox_notifications(user_id,title,message,notification_type)
      VALUES (NEW.user_id,'Complaint update','Your complaint '||NEW.ticket_no||' '||v_label||'.','complaint');
    END IF;
    RETURN NEW;
  ELSE
    IF NEW.actor_type = 'agent' AND NEW.event_type = 'reply' THEN
      INSERT INTO vfd_sandbox_notifications(user_id,title,message,notification_type)
      SELECT c.user_id,'New reply on your complaint','Support replied on '||c.ticket_no||'. Open the app to read it.','complaint'
      FROM complaints c WHERE c.id = NEW.complaint_id;
    ELSIF NEW.actor_type = 'user' AND NEW.event_type = 'reply' THEN
      UPDATE complaints SET status = 'in_review', updated_at = now() WHERE id = NEW.complaint_id AND status = 'awaiting_reply';
      UPDATE complaints SET updated_at = now() WHERE id = NEW.complaint_id;
    END IF;
    RETURN NEW;
  END IF;
END $$;
CREATE TRIGGER complaints_notify_ins AFTER INSERT ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.complaints_notify();
CREATE TRIGGER complaints_notify_upd BEFORE UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.complaints_notify();
CREATE TRIGGER complaint_events_notify AFTER INSERT ON public.complaint_events FOR EACH ROW EXECUTE FUNCTION public.complaints_notify();

-- Private storage policies (bucket created separately)
CREATE POLICY "Users upload own complaint files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'complaint-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own complaint files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'complaint-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

INSERT INTO public.complaint_categories(service,issue_type,label,priority,sla_hours,owner_team,sort_order) VALUES
('fraud','unauthorized_debit','Money left my account without my approval','Critical',4,'fraud',1),
('fraud','account_compromised','Someone else accessed my account','Critical',4,'fraud',2),
('fraud','scam','I was tricked into sending money','Critical',4,'fraud',3),
('transfers','not_received','Recipient did not receive the money','High',24,'payments',1),
('transfers','debited_failed','I was debited but the transfer failed','High',24,'payments',2),
('transfers','wrong_recipient','I sent money to the wrong account','High',48,'payments',3),
('transfers','pending_long','Transfer has been pending too long','Medium',24,'payments',4),
('bills','not_delivered','Airtime, data or token not delivered','High',24,'bills',1),
('bills','wrong_amount','Wrong amount or package','Medium',48,'bills',2),
('bills','debited_failed','Debited but payment failed','High',24,'bills',3),
('add_money','not_credited','My deposit has not reflected','High',12,'payments',1),
('add_money','wrong_amount','Wrong amount credited','Medium',24,'payments',2),
('ajo','contribution_missing','My contribution is not showing','High',24,'thrift',1),
('ajo','payout_missing','I did not receive my payout','High',24,'thrift',2),
('ajo','mandate_issue','Direct debit or mandate problem','Medium',48,'thrift',3),
('ajo','group_issue','Problem with group members or order','Low',72,'thrift',4),
('escrow','not_released','Funds not released','High',24,'escrow',1),
('escrow','dispute','Dispute with the other party','Medium',72,'escrow',2),
('savings','withdraw_failed','Could not withdraw my savings','High',24,'savings',1),
('savings','interest_wrong','Interest looks wrong','Medium',72,'savings',2),
('savings','balance_wrong','Savings balance looks wrong','High',48,'savings',3),
('split','not_paid','Participant payment not received','Medium',48,'payments',1),
('split','settlement','Split was not settled','Medium',48,'payments',2),
('account','login','I cannot sign in','High',12,'support',1),
('account','kyc','Tier upgrade or verification problem','Medium',72,'compliance',2),
('account','pin','PIN or biometrics problem','Medium',24,'support',3),
('account','profile','Wrong details on my profile','Low',72,'support',4),
('fees','unexpected','I was charged a fee I didn''t expect','Medium',72,'finance',1),
('fees','double','I was charged twice','High',24,'finance',2);