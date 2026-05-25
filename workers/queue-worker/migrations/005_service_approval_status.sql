-- Admin approval workflow for catalog services
ALTER TABLE services ADD COLUMN approvalStatus TEXT DEFAULT 'approved';
