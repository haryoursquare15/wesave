
-- Trigger function: send SplitPay receipt when all participants have paid
CREATE OR REPLACE FUNCTION public.notify_splitpay_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire when status transitions to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    PERFORM net.http_post(
      url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/splitpay-receipt',
      body := jsonb_build_object('split_request_id', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkd2txd21xZ3BzanJtaWprZGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMTE4MzQsImV4cCI6MjA4NTU4NzgzNH0.UNRTO1JUQen6hjQuB98_CZ00f4z7DLOAuScjPL0jPG4'
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'SplitPay receipt trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Attach trigger to split_requests table
CREATE TRIGGER on_splitpay_completed
  AFTER UPDATE ON public.split_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_splitpay_receipt();
