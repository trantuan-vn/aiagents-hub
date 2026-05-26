-- Drop single-column UNIQUE indexes that conflict with composite (user_id, field)
-- These single-field unique indexes cause errors like:
--   UNIQUE constraint failed: services.endpoint
-- because D1 aggregates rows across many users.

-- services(endpoint) -> keep only (user_id, endpoint)
DROP INDEX IF EXISTS "uidx_services_endpoint";

-- vouchers(code) -> keep only (user_id, code)
DROP INDEX IF EXISTS "uidx_vouchers_code";

-- users(identifier) -> keep only (user_id, identifier)
DROP INDEX IF EXISTS "uidx_users_identifier";

-- sessions(hashSessionId) -> keep only (user_id, hashSessionId)
DROP INDEX IF EXISTS "uidx_sessions_hashSessionId";

-- connections(connectionId) -> keep only (user_id, connectionId)
DROP INDEX IF EXISTS "uidx_connections_connectionId";

-- subscriptions(channel) -> keep only (user_id, channel)
DROP INDEX IF EXISTS "uidx_subscriptions_channel";

-- commission_policies(code) -> keep only (user_id, code)
DROP INDEX IF EXISTS "uidx_commission_policies_code";

-- agent_workflows(slug) -> keep only (user_id, slug)
DROP INDEX IF EXISTS "uidx_agent_workflows_slug";

-- workflow_user_stars(workflowKey) -> keep only (user_id, workflowKey)
DROP INDEX IF EXISTS "uidx_workflow_user_stars_workflowKey";

-- earnings_payouts(payoutKey) -> keep only (user_id, payoutKey)
DROP INDEX IF EXISTS "uidx_earnings_payouts_payoutKey";

-- exchange_rates(rateDate) -> keep only (user_id, rateDate)
DROP INDEX IF EXISTS "uidx_exchange_rates_rateDate";

-- passkey_credentials(credentialId) -> keep only (user_id, credentialId)
DROP INDEX IF EXISTS "uidx_passkey_credentials_credentialId";

-- backup_codes(codeHash) -> keep only (user_id, codeHash)
DROP INDEX IF EXISTS "uidx_backup_codes_codeHash";
