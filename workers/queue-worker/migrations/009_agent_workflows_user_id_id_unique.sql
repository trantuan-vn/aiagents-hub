-- agent_workflows: one row per (user_id, id) in D1 (fixes duplicate rows from insert-only sync).
-- Apply with: wrangler d1 execute <DB> --file=./migrations/009_agent_workflows_user_id_id_unique.sql
--
-- Dedupe legacy rows, then enforce composite unique index (matches queueTableWithUniqueIndex('id')).

DELETE FROM agent_workflows
WHERE globalId NOT IN (
  SELECT MAX(globalId) FROM agent_workflows GROUP BY user_id, id
);

CREATE UNIQUE INDEX IF NOT EXISTS "uidx_agent_workflows_user_id"
  ON "agent_workflows" ("user_id", "id");
