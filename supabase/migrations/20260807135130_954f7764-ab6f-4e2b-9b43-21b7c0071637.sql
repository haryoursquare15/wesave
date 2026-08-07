UPDATE public.vestara_savings
SET mandate_status = NULL, mandate_reference = NULL
WHERE id IN ('c026d036-5261-4322-9fc7-7cb2aea3a871','4cd2f9c1-d003-4dfe-ae2b-a31e647bcaaf');

DELETE FROM public.vfd_savings_mandate_events
WHERE savings_id IN ('c026d036-5261-4322-9fc7-7cb2aea3a871','4cd2f9c1-d003-4dfe-ae2b-a31e647bcaaf');

UPDATE public.vfd_sandbox_targets
SET mandate_status = 'pending', mandate_reference = NULL
WHERE id = 'b952a215-98f4-4c71-a52c-b3e2afe7f79e';

UPDATE public.vfd_sandbox_group_members
SET mandate_status = 'pending',
    mandate_reference = NULL,
    mandate_code = NULL,
    mandate_authorized_at = NULL,
    mandate_payload = NULL
WHERE mandate_status = 'authorized'
  AND (mandate_reference LIKE 'vestara-ddm-%' OR mandate_reference LIKE 'vestara-AJO-%');

UPDATE public.vfd_sandbox_groups
SET mandate_status = 'pending'
WHERE mandate_status = 'authorized';