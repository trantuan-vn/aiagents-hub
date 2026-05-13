-- Reference migrations for sync/schema docs. UserDO SQLite may add columns via Zod schema at runtime.
ALTER TABLE services ADD COLUMN feePercent REAL DEFAULT 100;
ALTER TABLE users ADD COLUMN walletBalance REAL DEFAULT 0;
