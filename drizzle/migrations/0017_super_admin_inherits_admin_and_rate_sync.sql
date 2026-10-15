CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR (_role = 'admin'::app_role AND role = 'super_admin'::app_role))
  )
$$;

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_any_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.sync_product_rates_from_configs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text := COALESCE(NEW.product_code, OLD.product_code)::text;
BEGIN
  UPDATE public.vestara_products p
     SET min_user_rate = s.mn, max_user_rate = s.mx, updated_at = now()
    FROM (SELECT min(user_rate) mn, max(user_rate) mx FROM public.vestara_rate_configs
           WHERE product_code::text = _code AND is_active) s
   WHERE p.code::text = _code AND s.mn IS NOT NULL;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_product_rates ON public.vestara_rate_configs;
CREATE TRIGGER trg_sync_product_rates AFTER INSERT OR UPDATE OR DELETE ON public.vestara_rate_configs
FOR EACH ROW EXECUTE FUNCTION public.sync_product_rates_from_configs();