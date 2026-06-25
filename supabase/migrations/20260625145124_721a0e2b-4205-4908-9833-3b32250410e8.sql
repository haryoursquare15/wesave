
CREATE OR REPLACE FUNCTION public.admin_grant_permission(_role app_role, _permission text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;
  INSERT INTO public.admin_permissions(role, permission) VALUES (_role, _permission)
  ON CONFLICT DO NOTHING;
  RETURN json_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_permission(_role app_role, _permission text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;
  DELETE FROM public.admin_permissions WHERE role = _role AND permission = _permission;
  RETURN json_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE(user_id uuid, email text, full_name text, roles app_role[], created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  RETURN QUERY
  SELECT ur.user_id,
         u.email::text,
         p.full_name,
         array_agg(ur.role ORDER BY ur.role) AS roles,
         min(ur.created_at) AS created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('admin','super_admin','operations_admin','support_officer','finance_admin','compliance_admin')
  GROUP BY ur.user_id, u.email, p.full_name;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_grant_permission(app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_permission(app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_staff() TO authenticated;
