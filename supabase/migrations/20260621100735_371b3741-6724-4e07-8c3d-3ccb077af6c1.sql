-- 1. vestara_products: restrict SELECT to active products for non-admins
DROP POLICY IF EXISTS "Anyone can view active products" ON public.vestara_products;
CREATE POLICY "Active products visible to users, all to admins"
ON public.vestara_products
FOR SELECT
TO authenticated
USING (
  is_active = true
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- 2. profiles: drop broad admin SELECT (PII exposure). Admins use audited edge fn.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- 3. user_roles: only super_admin may mutate role assignments
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can delete roles" ON public.user_roles;

CREATE POLICY "Only super_admin can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super_admin can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super_admin can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));