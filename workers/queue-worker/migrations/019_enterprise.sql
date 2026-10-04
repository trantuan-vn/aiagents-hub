-- Enterprise organizations (docs/enterprise-organization-spec.md §4.3).
-- These tables live only in D1: never add them to queue-worker SYNC_TABLE_NAMES or to a d1tor2 pipeline.
-- Archiving would delete trigger credentials and break POST /hooks/enterprise/:token.

CREATE TABLE IF NOT EXISTS enterprises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_pro_seats INTEGER NOT NULL,
  status TEXT NOT NULL,        -- 'pending' | 'active' | 'suspended'
  seat_grace_until TEXT,
  admin_hold INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  period_end TEXT,
  plan_interval INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enterprise_members (
  enterprise_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seat_role TEXT NOT NULL,     -- 'business' | 'pro'
  created_at TEXT NOT NULL,
  PRIMARY KEY (enterprise_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS enterprise_members_one_org ON enterprise_members(user_id);

CREATE TABLE IF NOT EXISTS enterprise_trigger_grants (
  enterprise_id TEXT NOT NULL,
  workflow_owner_id TEXT NOT NULL,
  workflow_id INTEGER NOT NULL,
  grantee_user_id TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  monthly_credit_cap REAL,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workflow_owner_id, workflow_id, grantee_user_id, trigger_key)
);

CREATE INDEX IF NOT EXISTS enterprise_trigger_grants_grantee
  ON enterprise_trigger_grants(grantee_user_id, enterprise_id);

CREATE TABLE IF NOT EXISTS enterprise_trigger_credentials (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  workflow_owner_id TEXT NOT NULL,
  workflow_id INTEGER NOT NULL,
  grantee_user_id TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS enterprise_trigger_credentials_token
  ON enterprise_trigger_credentials(token_hash);

CREATE TABLE IF NOT EXISTS enterprise_invoices (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  payer_user_id TEXT NOT NULL,
  kind TEXT NOT NULL,          -- 'period' | 'seat'
  plan_interval INTEGER NOT NULL,
  amount_usd REAL NOT NULL,
  period_start TEXT,
  period_end TEXT,
  roster_json TEXT NOT NULL,
  status TEXT NOT NULL,        -- 'pending' | 'paid' | 'cancelled' | 'expired'
  applied_user_ids TEXT NOT NULL DEFAULT '[]',
  order_id TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

-- At most one pending invoice per organization.
CREATE UNIQUE INDEX IF NOT EXISTS enterprise_invoices_one_pending
  ON enterprise_invoices(enterprise_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS enterprise_flag_requests (
  id TEXT PRIMARY KEY,
  workflow_owner_id TEXT NOT NULL,
  workflow_id INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL,        -- 'pending' | 'approved' | 'rejected' | 'withdrawn'
  reason TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS enterprise_flag_requests_pending
  ON enterprise_flag_requests(status, created_at);

CREATE TABLE IF NOT EXISTS enterprise_events (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS enterprise_events_by_org
  ON enterprise_events(enterprise_id, created_at);
