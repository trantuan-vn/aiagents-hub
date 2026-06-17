-- Global workflow node catalog (admin-managed enable/disable for add-node picker)
CREATE TABLE IF NOT EXISTS workflow_node_catalog (
  id TEXT PRIMARY KEY,
  add_category TEXT NOT NULL,
  runtime_type TEXT NOT NULL,
  kind TEXT,
  name_key TEXT NOT NULL,
  desc_key TEXT NOT NULL,
  has_backend INTEGER NOT NULL DEFAULT 0,
  has_frontend INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_node_catalog_category
  ON workflow_node_catalog (add_category, sort_order);
