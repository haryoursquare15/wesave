-- Enable realtime for admin dashboard tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_memberships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.thrift_groups;