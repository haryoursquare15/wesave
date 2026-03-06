
-- Create a SECURITY DEFINER function to check if a user is a participant in a split request
-- This avoids recursive RLS on split_participants
CREATE OR REPLACE FUNCTION public.is_split_participant(_split_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.split_participants
    WHERE split_request_id = _split_request_id
      AND user_id = _user_id
  )
$$;

-- Drop the old recursive SELECT policy
DROP POLICY IF EXISTS "Users can view participants of their splits" ON public.split_participants;

-- Create a new non-recursive SELECT policy
CREATE POLICY "Users can view participants of their splits"
ON public.split_participants
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_split_request_creator(split_request_id)
  OR is_split_participant(split_request_id, auth.uid())
);
