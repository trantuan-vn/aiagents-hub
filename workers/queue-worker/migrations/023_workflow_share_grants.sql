-- Per-workflow share list: JSON array of { id, audience: "all"|"users", emails, triggerKinds }.
-- NULL keeps the legacy publicTriggerKinds rule (one set for every community user).
-- UserDO is the writer; queue-worker projects the column here.
-- Apply before deploying auth-worker: the community list filters on this column.

ALTER TABLE agent_workflows ADD COLUMN shareGrants TEXT;
