DROP POLICY IF EXISTS "Admins can manage products" ON public.vestara_products;

CREATE POLICY "Admins can insert products"
  ON public.vestara_products FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update products"
  ON public.vestara_products FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete products"
  ON public.vestara_products FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));