-- Fix the respond_to_swap_request function with explicit type casting and better error handling
CREATE OR REPLACE FUNCTION public.respond_to_swap_request(
  _request_id uuid,
  _accept boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request position_swap_requests%ROWTYPE;
  _requester_membership group_memberships%ROWTYPE;
  _target_membership group_memberships%ROWTYPE;
  _caller_id uuid;
BEGIN
  _caller_id := auth.uid();
  
  IF _caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Lock and fetch the request
  SELECT * INTO _request
  FROM position_swap_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  -- Check caller is target
  IF _request.target_id != _caller_id THEN
    RETURN json_build_object('success', false, 'error', 'Only target can respond to swap request');
  END IF;

  -- Check request is pending
  IF _request.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Request is no longer pending');
  END IF;

  IF _accept THEN
    -- Lock memberships
    SELECT * INTO _requester_membership
    FROM group_memberships
    WHERE group_id = _request.group_id AND user_id = _request.requester_id
    FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE position_swap_requests SET status = 'rejected', responded_at = now() WHERE id = _request_id;
      RETURN json_build_object('success', false, 'error', 'Requester is no longer a member');
    END IF;

    SELECT * INTO _target_membership
    FROM group_memberships
    WHERE group_id = _request.group_id AND user_id = _request.target_id
    FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE position_swap_requests SET status = 'rejected', responded_at = now() WHERE id = _request_id;
      RETURN json_build_object('success', false, 'error', 'You are no longer a member');
    END IF;

    -- Check neither has received payout yet
    IF COALESCE(_requester_membership.has_received_payout, false) OR COALESCE(_target_membership.has_received_payout, false) THEN
      UPDATE position_swap_requests
      SET status = 'rejected', responded_at = now()
      WHERE id = _request_id;
      
      RETURN json_build_object('success', false, 'error', 'Cannot swap after receiving payout');
    END IF;

    -- Swap positions
    UPDATE group_memberships
    SET payout_position = _request.target_position
    WHERE group_id = _request.group_id AND user_id = _request.requester_id;

    UPDATE group_memberships
    SET payout_position = _request.requester_position
    WHERE group_id = _request.group_id AND user_id = _request.target_id;

    -- Mark both as having used their swap
    UPDATE group_memberships
    SET has_used_swap = true
    WHERE group_id = _request.group_id AND user_id IN (_request.requester_id, _request.target_id);

    -- Update request status
    UPDATE position_swap_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = _request_id;

    -- Log audit (with explicit jsonb cast)
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (
      _caller_id,
      'position_swap_accepted',
      'position_swap_requests',
      _request_id::text,
      jsonb_build_object(
        'requester_id', _request.requester_id,
        'target_id', _request.target_id,
        'from_positions', jsonb_build_object('requester', _request.requester_position, 'target', _request.target_position),
        'to_positions', jsonb_build_object('requester', _request.target_position, 'target', _request.requester_position)
      )
    );

    RETURN json_build_object('success', true, 'message', 'Positions swapped successfully');
  ELSE
    -- Reject the request
    UPDATE position_swap_requests
    SET status = 'rejected', responded_at = now()
    WHERE id = _request_id;

    -- Log audit
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (
      _caller_id,
      'position_swap_rejected',
      'position_swap_requests',
      _request_id::text,
      jsonb_build_object('requester_id', _request.requester_id, 'target_id', _request.target_id)
    );

    RETURN json_build_object('success', true, 'message', 'Swap request rejected');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'Swap failed: ' || SQLERRM);
END;
$$;

-- Add KYC document columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS id_type text,
ADD COLUMN IF NOT EXISTS id_number text,
ADD COLUMN IF NOT EXISTS id_document_url text,
ADD COLUMN IF NOT EXISTS utility_bill_url text;

-- Create storage bucket for KYC documents
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('kyc-documents', 'kyc-documents', false, 5242880)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for KYC documents
CREATE POLICY "Users can upload own KYC docs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'kyc-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own KYC docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'kyc-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own KYC docs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'kyc-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all KYC docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'kyc-documents' AND is_any_admin(auth.uid()));