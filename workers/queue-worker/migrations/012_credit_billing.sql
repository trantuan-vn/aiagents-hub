-- Credit billing (spec v0.2). Columns match Zod / D1 schema sync (camelCase).
-- Apply with: wrangler d1 migrations apply aiagents-hub-db --remote

ALTER TABLE service_usages ADD COLUMN creditsUsage REAL;
ALTER TABLE service_usages ADD COLUMN creditsRoyalty REAL;
ALTER TABLE service_usages ADD COLUMN creditsCharged REAL;
ALTER TABLE service_usages ADD COLUMN cogsAiUsd REAL;
ALTER TABLE service_usages ADD COLUMN cogsInfraUsdEst REAL;
ALTER TABLE service_usages ADD COLUMN paymentFeeUsd REAL;
ALTER TABLE service_usages ADD COLUMN revenueUsd REAL;
ALTER TABLE service_usages ADD COLUMN contributionUsd REAL;
ALTER TABLE service_usages ADD COLUMN contributionPct REAL;
ALTER TABLE service_usages ADD COLUMN modelId TEXT;
ALTER TABLE service_usages ADD COLUMN modelClass TEXT;
ALTER TABLE service_usages ADD COLUMN creditRateVersion INTEGER;

ALTER TABLE services ADD COLUMN modelClass TEXT;
ALTER TABLE services ADD COLUMN creditCoeffInput REAL;
ALTER TABLE services ADD COLUMN creditCoeffOutput REAL;
ALTER TABLE services ADD COLUMN creditCoeffInputCache REAL;
ALTER TABLE services ADD COLUMN creditRateVersion INTEGER;

ALTER TABLE users ADD COLUMN walletCurrency TEXT DEFAULT 'USD';
ALTER TABLE users ADD COLUMN creditLotsJson TEXT;

ALTER TABLE orders ADD COLUMN usdVndRate REAL;
ALTER TABLE orders ADD COLUMN creditPriceUsd REAL;
ALTER TABLE orders ADD COLUMN creditedCredits REAL;
