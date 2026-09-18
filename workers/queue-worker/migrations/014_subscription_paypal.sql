-- Subscription PayPal fields (spec v1.1). UserDO SQLite also picks these up from UserSchema.

ALTER TABLE users ADD COLUMN planSource TEXT;
ALTER TABLE users ADD COLUMN paypalSubscriptionId TEXT;
ALTER TABLE users ADD COLUMN paypalPayerId TEXT;
ALTER TABLE users ADD COLUMN paypalPlanId TEXT;
ALTER TABLE users ADD COLUMN planInterval INTEGER;
ALTER TABLE users ADD COLUMN planCurrentPeriodEnd TEXT;
ALTER TABLE users ADD COLUMN planStatus TEXT;
ALTER TABLE users ADD COLUMN cancelAtPeriodEnd INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN pendingPlanId TEXT;
ALTER TABLE users ADD COLUMN enterpriseContract INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN autoTopUpEnabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN autoTopUpUsd INTEGER;
ALTER TABLE users ADD COLUMN graceCreditsUsedMonth REAL DEFAULT 0;
ALTER TABLE users ADD COLUMN graceCogsUsdMonth REAL DEFAULT 0;
ALTER TABLE users ADD COLUMN graceMonthYm TEXT;
ALTER TABLE users ADD COLUMN graceRunsToday INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN graceRunsOn TEXT;
ALTER TABLE users ADD COLUMN graceLastByWorkflowJson TEXT;

CREATE TABLE IF NOT EXISTS paypal_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL
);
