-- Per-token model pricing on services (USD per 1M tokens)
ALTER TABLE services ADD COLUMN model TEXT;
ALTER TABLE services ADD COLUMN priceInput REAL;
ALTER TABLE services ADD COLUMN priceOutput REAL;
ALTER TABLE services ADD COLUMN priceInputCache REAL;
