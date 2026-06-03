-- passkey_credentials: one row per (user_id, credentialId) in D1 (fixes duplicate rows from insert-only sync).
-- Apply with: wrangler d1 execute <DB> --file=./migrations/010_passkey_credentials_user_id_credentialId_unique.sql
--
-- Dedupe legacy rows, then enforce composite unique index (matches queueTableWithUniqueIndex('credentialId')).

DELETE FROM passkey_credentials
WHERE globalId NOT IN (
  SELECT MAX(globalId) FROM passkey_credentials GROUP BY user_id, credentialId
);

CREATE UNIQUE INDEX IF NOT EXISTS "uidx_passkey_credentials_user_credentialId"
  ON "passkey_credentials" ("user_id", "credentialId");
