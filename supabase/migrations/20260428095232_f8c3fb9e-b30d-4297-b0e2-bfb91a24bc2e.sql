-- Mark llh's invite as accepted
UPDATE vfd_sandbox_target_invites
SET status = 'accepted', responded_at = now()
WHERE id = '54117b84-76e7-4386-8195-f40e430f0654' AND status = 'pending';

-- Recompute member_count from the source of truth
UPDATE vfd_sandbox_targets t
SET member_count = (SELECT COUNT(*) FROM vfd_sandbox_target_members m WHERE m.target_id = t.id),
    updated_at = now()
WHERE t.id = 'c3f9ba82-0941-46af-9d57-32caa76db9de';