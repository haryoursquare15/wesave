GRANT EXECUTE ON FUNCTION public.send_split_invite(uuid, uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_split_invite(uuid, uuid, uuid, numeric) TO anon;
NOTIFY pgrst, 'reload schema';