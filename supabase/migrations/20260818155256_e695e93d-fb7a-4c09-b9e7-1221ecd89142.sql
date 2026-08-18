update public.vfd_sandbox_bill_receipts
set refunded_at = coalesce(refunded_at, now())
where status in ('failed','refunded')
  and refunded_at is null
  and paid_at < now() - interval '6 hours';