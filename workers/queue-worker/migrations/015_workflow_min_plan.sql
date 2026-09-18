ALTER TABLE agent_workflows ADD COLUMN minPlanId TEXT DEFAULT 'free';
ALTER TABLE agent_workflows ADD COLUMN graceWhenExhausted INTEGER DEFAULT 0;
