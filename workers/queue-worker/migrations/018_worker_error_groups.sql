-- Admin Worker error index (not a log warehouse). Auth-worker also CREATE TABLE IF NOT EXISTS on first poll.

CREATE TABLE IF NOT EXISTS worker_error_groups (
  fingerprint TEXT PRIMARY KEY,
  script_name TEXT NOT NULL,
  component TEXT,
  event TEXT,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  count_1h INTEGER NOT NULL DEFAULT 0,
  count_24h INTEGER NOT NULL DEFAULT 0,
  count_total INTEGER NOT NULL DEFAULT 0,
  excerpt TEXT,
  runbook_id TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_worker_err_last ON worker_error_groups (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_worker_err_status ON worker_error_groups (status, last_seen DESC);

CREATE TABLE IF NOT EXISTS worker_error_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  status TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_worker_err_notes ON worker_error_notes (fingerprint, at DESC);
