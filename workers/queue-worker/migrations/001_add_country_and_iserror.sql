-- Add country to sessions (for visitor stats by country)
ALTER TABLE sessions ADD COLUMN country TEXT;

-- Add isError to service_usages (for API error rate tracking)
ALTER TABLE service_usages ADD COLUMN isError INTEGER DEFAULT 0;

ALTER TABLE connections ADD COLUMN connectionId TEXT;