-- Plan entitlements (spec v0.2 Phase 2). Columns match UserSchema camelCase.
-- Apply with: wrangler d1 migrations apply aiagents-hub-db --remote

ALTER TABLE users ADD COLUMN planId TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN planPeriodYm TEXT;
ALTER TABLE users ADD COLUMN workflowRunsToday INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN workflowRunsOn TEXT;
