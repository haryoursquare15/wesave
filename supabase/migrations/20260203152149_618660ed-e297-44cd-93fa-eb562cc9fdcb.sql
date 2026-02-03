-- Fix Security Issue 1: Restrict group_invitations to only allow viewing with specific token
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.group_invitations;

-- Create a more restrictive policy that requires the token in the query
CREATE POLICY "View invitation only with matching token"
ON public.group_invitations
FOR SELECT
USING (
  -- Allow admins to see all their group invitations
  is_group_admin(group_id)
  -- Allow anyone to see if they provide the exact token (handled via RPC instead)
);

-- Fix Security Issue 2: Create a secure view for profiles that hides sensitive fields
-- First, create a public-safe view that hides banking/sensitive information
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true)
AS SELECT 
  id,
  username,
  full_name,
  avatar_url,
  membership_tier,
  credit_score,
  completed_cycles,
  created_at
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;

-- Create user_roles table for admin access
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
FOR DELETE
USING (public.is_admin());

-- Admin functions for dashboard
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  username TEXT,
  membership_tier membership_tier,
  credit_score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  role app_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.username,
    p.membership_tier,
    p.credit_score,
    p.created_at,
    ur.role
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_all_groups()
RETURNS TABLE (
  id UUID,
  name TEXT,
  admin_id UUID,
  admin_name TEXT,
  status group_status,
  member_count BIGINT,
  contribution_amount NUMERIC,
  period contribution_period,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;
  
  RETURN QUERY
  SELECT 
    g.id,
    g.name,
    g.admin_id,
    p.full_name as admin_name,
    g.status,
    (SELECT COUNT(*) FROM public.group_memberships gm WHERE gm.group_id = g.id AND gm.status = 'active') as member_count,
    g.contribution_amount,
    g.period,
    g.created_at
  FROM public.thrift_groups g
  LEFT JOIN public.profiles p ON p.id = g.admin_id
  ORDER BY g.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;
  
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'total_groups', (SELECT COUNT(*) FROM public.thrift_groups),
    'active_groups', (SELECT COUNT(*) FROM public.thrift_groups WHERE status = 'active'),
    'pending_groups', (SELECT COUNT(*) FROM public.thrift_groups WHERE status = 'pending'),
    'total_transactions', (SELECT COUNT(*) FROM public.transactions),
    'total_volume', (SELECT COALESCE(SUM(amount), 0) FROM public.transactions WHERE status = 'completed')
  ) INTO result;
  
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_role(_user_id UUID, _role app_role)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN json_build_object('success', true, 'message', 'Role assigned');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_role(_user_id UUID, _role app_role)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;
  
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND role = _role;
  
  RETURN json_build_object('success', true, 'message', 'Role removed');
END;
$$;