-- Trigger kinds community users may start on a shared workflow (JSON array, e.g. ["chat","form"]).
-- NULL allows every kind. UserDO is the writer; queue-worker projects it here.
-- Apply before deploying auth-worker: the shared list and shared detail queries select this column.

ALTER TABLE agent_workflows ADD COLUMN publicTriggerKinds TEXT;
