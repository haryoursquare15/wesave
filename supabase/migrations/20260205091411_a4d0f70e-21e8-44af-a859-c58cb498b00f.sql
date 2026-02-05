-- =====================================================
-- STEP 1: Add new admin roles to existing enum
-- =====================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operations_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'compliance_admin';