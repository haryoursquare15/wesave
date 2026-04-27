ALTER TABLE public.flow_health DROP CONSTRAINT IF EXISTS flow_health_status_check;
ALTER TABLE public.flow_health ADD CONSTRAINT flow_health_status_check
  CHECK (status = ANY (ARRAY['healthy','degraded','down','idle','pass','warn','fail']));
CREATE INDEX IF NOT EXISTS idx_flow_health_checked_at ON public.flow_health (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_health_flow_name_checked_at ON public.flow_health (flow_name, checked_at DESC);