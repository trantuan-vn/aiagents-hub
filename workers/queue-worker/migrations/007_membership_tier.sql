-- Membership tier fields synced from UserDO users table
ALTER TABLE users ADD COLUMN membership_tier TEXT DEFAULT 'member';
ALTER TABLE users ADD COLUMN tier_period_ym TEXT;
ALTER TABLE users ADD COLUMN monthly_top_up_vnd INTEGER DEFAULT 0;
