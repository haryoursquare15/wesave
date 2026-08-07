UPDATE public.vfd_sandbox_bill_receipts
SET status = 'pending',
    delivery_status = 'pending',
    delivery_detail = COALESCE(delivery_detail, '{}'::jsonb) || jsonb_build_object('instruction', 'The biller has accepted this purchase but has not confirmed delivery yet. It will update automatically once confirmed.')
WHERE raw_response->'data'->>'transactionStatus' = '09'
  AND status <> 'failed';