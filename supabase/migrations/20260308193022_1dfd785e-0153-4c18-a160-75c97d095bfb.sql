-- Fix split_participants: admin SELECT policy should be PERMISSIVE, not RESTRICTIVE
DROP POLICY IF EXISTS "Admins can view all split participants" ON split_participants;
CREATE POLICY "Admins can view all split participants"
  ON split_participants FOR SELECT TO authenticated
  USING (is_any_admin(auth.uid()));

-- Fix split_participants: user SELECT policy should be PERMISSIVE
DROP POLICY IF EXISTS "Users can view participants of their splits" ON split_participants;
CREATE POLICY "Users can view participants of their splits"
  ON split_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_split_request_creator(split_request_id)
    OR is_split_participant(split_request_id, auth.uid())
  );

-- Fix split_requests: admin SELECT policy should be PERMISSIVE
DROP POLICY IF EXISTS "Admins can view all split requests" ON split_requests;
CREATE POLICY "Admins can view all split requests"
  ON split_requests FOR SELECT TO authenticated
  USING (is_any_admin(auth.uid()));

-- Fix split_requests: user SELECT policy should be PERMISSIVE
DROP POLICY IF EXISTS "Users can view split requests they created or participate in" ON split_requests;
CREATE POLICY "Users can view split requests they created or participate in"
  ON split_requests FOR SELECT TO authenticated
  USING (
    creator_user_id = auth.uid()
    OR is_split_participant(id, auth.uid())
  );

-- Also fix split_transactions SELECT if restrictive
DROP POLICY IF EXISTS "Users can view split transactions for their splits" ON split_transactions;
CREATE POLICY "Users can view split transactions for their splits"
  ON split_transactions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR split_request_id IN (SELECT sp.split_request_id FROM split_participants sp WHERE sp.user_id = auth.uid())
    OR is_any_admin(auth.uid())
  );

-- Fix other restrictive policies on split tables
-- Creator insert on participants
DROP POLICY IF EXISTS "Creator can insert participants" ON split_participants;
CREATE POLICY "Creator can insert participants"
  ON split_participants FOR ALL TO authenticated
  USING (is_split_request_creator(split_request_id))
  WITH CHECK (is_split_request_creator(split_request_id));

-- Participant update own status
DROP POLICY IF EXISTS "Participant can update own status" ON split_participants;
CREATE POLICY "Participant can update own status"
  ON split_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Split requests create
DROP POLICY IF EXISTS "Authenticated users can create split requests" ON split_requests;
CREATE POLICY "Authenticated users can create split requests"
  ON split_requests FOR INSERT TO authenticated
  WITH CHECK (creator_user_id = auth.uid());

-- Split requests update
DROP POLICY IF EXISTS "Creator can update own split requests" ON split_requests;
CREATE POLICY "Creator can update own split requests"
  ON split_requests FOR UPDATE TO authenticated
  USING (creator_user_id = auth.uid());

-- Split transactions insert
DROP POLICY IF EXISTS "System can insert split transactions" ON split_transactions;
CREATE POLICY "System can insert split transactions"
  ON split_transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';