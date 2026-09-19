-- Admin Cloudflare usage snapshots (FinOps). Auth-worker also CREATE TABLE IF NOT EXISTS on first sync.

CREATE TABLE IF NOT EXISTS cloudflare_usage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  workers_plan_id TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (period_start, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_cf_usage_captured ON cloudflare_usage_snapshots (captured_at DESC);

CREATE TABLE IF NOT EXISTS cloudflare_usage_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
