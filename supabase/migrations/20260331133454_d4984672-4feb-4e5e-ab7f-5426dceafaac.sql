-- Add missing columns for SplitPay production parity
ALTER TABLE IF EXISTS vfd_sandbox_splits
ADD COLUMN IF NOT EXISTS fee_per_person numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS purpose text;

-- Ensure groups table has all needed columns
ALTER TABLE IF EXISTS vfd_sandbox_groups
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS auto_debit boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS contribution_hour integer DEFAULT 16,
ADD COLUMN IF NOT EXISTS contribution_minute integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS contribution_day_of_week integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS contribution_day_of_month integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_cycles integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS payout_order jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS current_payout_position integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS commenced_at timestamptz;

-- Ensure group_members has all needed columns  
ALTER TABLE IF EXISTS vfd_sandbox_group_members
ADD COLUMN IF NOT EXISTS payout_position integer,
ADD COLUMN IF NOT EXISTS has_contributed_current boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS has_received_payout boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS has_used_swap boolean DEFAULT false;

-- Ensure target table columns
ALTER TABLE IF EXISTS vfd_sandbox_targets
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS reason text,
ADD COLUMN IF NOT EXISTS invite_limit integer;

-- Ensure target members has contributed_amount
ALTER TABLE IF EXISTS vfd_sandbox_target_members
ADD COLUMN IF NOT EXISTS contributed_amount numeric DEFAULT 0;

-- Ensure campaign table columns
ALTER TABLE IF EXISTS vfd_sandbox_campaigns
ADD COLUMN IF NOT EXISTS contribution_visibility text DEFAULT 'public',
ADD COLUMN IF NOT EXISTS beneficiary_account_name text,
ADD COLUMN IF NOT EXISTS beneficiary_bank_name text,
ADD COLUMN IF NOT EXISTS beneficiary_account_number text,
ADD COLUMN IF NOT EXISTS campaign_image text,
ADD COLUMN IF NOT EXISTS campaign_slug text;
