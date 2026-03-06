
-- Create helper functions to break the circular RLS dependency

CREATE OR REPLACE FUNCTION public.is_split_request_creator(_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM split_requests
    WHERE id = _request_id AND creator_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_split_participant(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT split_request_id FROM split_participants
  WHERE user_id = _user_id;
$$;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view split requests they created or participate in" ON public.split_requests;
DROP POLICY IF EXISTS "Users can view participants of their splits" ON public.split_participants;
DROP POLICY IF EXISTS "Creator can insert participants" ON public.split_participants;

-- Recreate split_requests SELECT policy using security definer function
CREATE POLICY "Users can view split requests they created or participate in"
ON public.split_requests
FOR SELECT
TO authenticated
USING (
  creator_user_id = auth.uid()
  OR id IN (SELECT public.is_split_participant(auth.uid()))
);

-- Recreate split_participants SELECT policy using security definer function
CREATE POLICY "Users can view participants of their splits"
ON public.split_participants
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_split_request_creator(split_request_id)
);

-- Recreate split_participants INSERT policy using security definer function
CREATE POLICY "Creator can insert participants"
ON public.split_participants
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_split_request_creator(split_request_id)
);
