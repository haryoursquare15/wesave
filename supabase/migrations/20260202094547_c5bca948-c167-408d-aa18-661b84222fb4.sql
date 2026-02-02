-- Create enum types for the platform
CREATE TYPE public.membership_tier AS ENUM ('gold', 'silver', 'bronze', 'newbie');
CREATE TYPE public.contribution_period AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE public.group_status AS ENUM ('pending', 'active', 'completed', 'paused');
CREATE TYPE public.membership_status AS ENUM ('active', 'pending', 'removed');
CREATE TYPE public.transaction_type AS ENUM ('contribution', 'payout', 'funding', 'withdrawal', 'lock', 'unlock', 'service_fee');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'rejected');

-- Create profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  bvn TEXT,
  bank_account TEXT,
  bank_name TEXT,
  membership_tier membership_tier NOT NULL DEFAULT 'newbie',
  credit_score INTEGER DEFAULT 0,
  completed_cycles INTEGER DEFAULT 0,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create wallets table
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  available_balance DECIMAL(15,2) DEFAULT 0,
  locked_balance DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create thrift_groups table
CREATE TABLE public.thrift_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  max_members INTEGER NOT NULL DEFAULT 5,
  contribution_amount DECIMAL(15,2) NOT NULL,
  period contribution_period NOT NULL DEFAULT 'weekly',
  auto_debit BOOLEAN DEFAULT true,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  status group_status NOT NULL DEFAULT 'pending',
  rating DECIMAL(2,1) DEFAULT 0,
  current_cycle INTEGER DEFAULT 1,
  invite_code TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create group_wallets table
CREATE TABLE public.group_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE UNIQUE,
  contribution_balance DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create group_memberships table
CREATE TABLE public.group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payout_position INTEGER,
  status membership_status NOT NULL DEFAULT 'active',
  has_contributed_this_cycle BOOLEAN DEFAULT false,
  has_received_payout BOOLEAN DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  wallet_id UUID REFERENCES public.wallets(id),
  group_id UUID REFERENCES public.thrift_groups(id),
  type transaction_type NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status transaction_status NOT NULL DEFAULT 'pending',
  description TEXT,
  reference TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create pending_join_requests table
CREATE TABLE public.pending_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thrift_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_join_requests ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is a group member
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_memberships
    WHERE group_id = _group_id
    AND user_id = auth.uid()
    AND status = 'active'
  )
$$;

-- Helper function: Check if user is a group admin
CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.thrift_groups
    WHERE id = _group_id
    AND admin_id = auth.uid()
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- RLS Policies for wallets
CREATE POLICY "Users can view own wallet"
  ON public.wallets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own wallet"
  ON public.wallets FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own wallet"
  ON public.wallets FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for thrift_groups
CREATE POLICY "Admins can create groups"
  ON public.thrift_groups FOR INSERT
  WITH CHECK (admin_id = auth.uid());

CREATE POLICY "Members and admins can view groups"
  ON public.thrift_groups FOR SELECT
  USING (public.is_group_member(id) OR public.is_group_admin(id));

CREATE POLICY "Admins can update their groups"
  ON public.thrift_groups FOR UPDATE
  USING (public.is_group_admin(id));

CREATE POLICY "Admins can delete their groups"
  ON public.thrift_groups FOR DELETE
  USING (public.is_group_admin(id));

-- RLS Policies for group_wallets
CREATE POLICY "Members can view group wallet"
  ON public.group_wallets FOR SELECT
  USING (public.is_group_member(group_id) OR public.is_group_admin(group_id));

-- RLS Policies for group_memberships
CREATE POLICY "Members can view group memberships"
  ON public.group_memberships FOR SELECT
  USING (public.is_group_member(group_id) OR public.is_group_admin(group_id) OR user_id = auth.uid());

CREATE POLICY "Admins can insert memberships"
  ON public.group_memberships FOR INSERT
  WITH CHECK (public.is_group_admin(group_id) OR user_id = auth.uid());

CREATE POLICY "Admins can update memberships"
  ON public.group_memberships FOR UPDATE
  USING (public.is_group_admin(group_id));

CREATE POLICY "Admins can delete memberships"
  ON public.group_memberships FOR DELETE
  USING (public.is_group_admin(group_id));

-- RLS Policies for transactions
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (user_id = auth.uid() OR (group_id IS NOT NULL AND (public.is_group_member(group_id) OR public.is_group_admin(group_id))));

CREATE POLICY "Users can create own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for pending_join_requests
CREATE POLICY "Admins can view requests for their groups"
  ON public.pending_join_requests FOR SELECT
  USING (public.is_group_admin(group_id) OR user_id = auth.uid());

CREATE POLICY "Users can create join requests"
  ON public.pending_join_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update requests"
  ON public.pending_join_requests FOR UPDATE
  USING (public.is_group_admin(group_id));

CREATE POLICY "Users can delete own pending requests"
  ON public.pending_join_requests FOR DELETE
  USING (user_id = auth.uid() AND status = 'pending');

-- Create public view for group pool (minimal info for non-members)
CREATE VIEW public.public_groups AS
SELECT 
  id,
  name,
  rating,
  max_members,
  contribution_amount,
  period,
  status,
  (SELECT COUNT(*) FROM public.group_memberships WHERE group_id = thrift_groups.id AND status = 'active') as member_count,
  (SELECT COUNT(*) FROM public.pending_join_requests WHERE group_id = thrift_groups.id AND status = 'pending') as pending_requests
FROM public.thrift_groups
WHERE status != 'pending';

-- Function to create user profile and wallet on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  -- Create wallet
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Trigger to create profile and wallet on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to create group wallet when group is created
CREATE OR REPLACE FUNCTION public.handle_new_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create group wallet
  INSERT INTO public.group_wallets (group_id)
  VALUES (NEW.id);
  
  -- Add admin as first member
  INSERT INTO public.group_memberships (group_id, user_id, payout_position)
  VALUES (NEW.id, NEW.admin_id, 1);
  
  RETURN NEW;
END;
$$;

-- Trigger to create group wallet and add admin as member
CREATE TRIGGER on_thrift_group_created
  AFTER INSERT ON public.thrift_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_group();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create timestamp triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_thrift_groups_updated_at
  BEFORE UPDATE ON public.thrift_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_group_wallets_updated_at
  BEFORE UPDATE ON public.group_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();