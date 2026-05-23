drop table agent_workflows; 
drop table api_tokens; 
drop table backup_codes;
drop table commission_policies;
drop table commissions;
drop table connections;
drop table earnings_payouts;
drop table exchange_rates;
drop table order_discounts;
drop table order_items;
drop table orders;
drop table passkey_credentials;
drop table payments;
drop table payout_beneficiary;
drop table pending_messages;
drop table price_policies;
drop table refunds;
drop table service_usages;
drop table services;
drop table sessions;
drop table subscriptions;
drop table user_did;
drop table user_ekyc;
drop table user_mfa;
drop table users;
drop table versions;
drop table vouchers;
drop table workflow_comments;
drop table workflow_royalties;
drop table workflow_user_stars;




drop table user_shards;
drop table broadcasts;
drop table service_configs;
drop table delivery_records;
drop table global_counters;

drop table cleanup_operations;
drop table shard_configs;
drop table shard_performances;
drop table user_registrations;

CREATE INDEX IF NOT EXISTS idx_service_usages_user_created 
ON service_usages ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_service_usages_user_service_created 
ON service_usages ("user_id", "serviceId", "created_at" DESC);

