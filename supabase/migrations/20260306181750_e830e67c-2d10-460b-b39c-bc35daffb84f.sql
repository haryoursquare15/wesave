
-- 1) Add unique constraint to split_transactions to prevent duplicate payments
ALTER TABLE split_transactions 
ADD CONSTRAINT split_transactions_unique_payment 
UNIQUE (split_request_id, user_id);

-- 2) Add idempotency check at the start of process_split_payment
-- (The unique constraint above will cause a DB error if a duplicate insert is attempted,
--  but we should also check upfront in the RPC to return a clean error)

NOTIFY pgrst, 'reload schema';
