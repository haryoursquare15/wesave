-- Force PostgREST schema cache reload for process_split_payment
NOTIFY pgrst, 'reload schema';