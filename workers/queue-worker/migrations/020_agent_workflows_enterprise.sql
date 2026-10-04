-- Enterprise columns on agent_workflows (docs/enterprise-organization-spec.md §4.3).
-- UserDO is the only writer; queue-worker projects them here. Never UPDATE these on D1 directly.
-- Kept apart from 019: if queue-worker ensureSchemaColumns already added a column, only this file fails.

ALTER TABLE agent_workflows ADD COLUMN isEnterprise INTEGER DEFAULT 0;
ALTER TABLE agent_workflows ADD COLUMN enterpriseId TEXT;
ALTER TABLE agent_workflows ADD COLUMN enterpriseAcceptance TEXT DEFAULT 'none';
ALTER TABLE agent_workflows ADD COLUMN acceptedRoyaltyPercent REAL;
